// service.ts — the Getränkekasse (#33): the Kasse's overview and books,
// where members pay and who sends the bills, and the drink settings behind
// the `drinks.markup` and `billing.treasurerRecipient` features.
//
// Every function takes the TenantScope it works in. Feature flags come from
// the scope's tenant (cached config, no query). Failures the user should
// read are DomainErrors; a failed query propagates.

import "server-only";

import { z } from "zod";
import type { FeatureKey } from "~/lib/features";
import { isValidIban } from "~/lib/iban";
import { isValidMarkupPercent } from "~/lib/pricing";
import {
	EMPTY_GETRAENKE_BILLING_PROFILE,
	type GetraenkeBillingProfile,
	type GetraenkeBillSenderResult,
	type GetraenkekasseKontoRow,
	type GetraenkekassePayment,
	resolveGetraenkeBillSender,
	resolveGetraenkekasseAccount,
	resolveGetraenkekassePayment,
} from "~/server/domain/getraenkekasse/payment";
import { ValidationError } from "~/server/lib/domain-error";
import { log } from "~/server/lib/log";
import { getTenantById } from "~/server/lib/tenant-context";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

async function hasFeature(
	{ tenantId }: TenantScope,
	key: FeatureKey,
): Promise<boolean> {
	return (await getTenantById(tenantId))?.features[key] ?? false;
}

async function brandingPaypal({ tenantId }: TenantScope) {
	return (await getTenantById(tenantId))?.branding?.paypalUrl;
}

// ─── Overview ────────────────────────────────────────────────────────────────

/**
 * What the Kasse is worth: bank balance, stock value of the last closed
 * inventory, the open member and group bills (due and deferred on separate
 * lines, so they add up to the open lists) and the Pfand, minus the open
 * external bills.
 */
export async function kasseSummary({ db }: TenantScope) {
	const [kassenstand, lagerwert, offeneRechnungen, externOffen, settings] =
		await Promise.all([
			repo.bankBalance(db),
			repo.lastInventoryValue(db),
			repo.openBillSums(db),
			repo.openExternalTotal(db),
			repo.kasseSettings(db),
		]);
	const pfand = Number(settings?.pfandWert ?? 0);

	const gesamt =
		kassenstand +
		lagerwert.value +
		offeneRechnungen.mitglieder +
		offeneRechnungen.gestundetMitglieder +
		offeneRechnungen.gruppen +
		offeneRechnungen.gestundetGruppen +
		pfand -
		externOffen;

	return {
		kassenstand,
		lagerwert: lagerwert.value,
		lagerwertDate: lagerwert.date,
		/** Member bills due now (Unbezahlt). */
		offeneMitglieder: offeneRechnungen.mitglieder,
		/** Deferred member bills (Gestundet): owed, but not due yet. */
		gestundetMitglieder: offeneRechnungen.gestundetMitglieder,
		offeneGruppen: offeneRechnungen.gruppen,
		gestundetGruppen: offeneRechnungen.gestundetGruppen,
		pfand,
		externOffen,
		gesamt,
	};
}

export async function pfandWert({ db }: TenantScope): Promise<number> {
	return Number((await repo.kasseSettings(db))?.pfandWert ?? 0);
}

export async function setPfandWert(
	{ db }: TenantScope,
	value: number,
	updatedBy: string,
) {
	await repo.saveKasseSettings(db, { pfandWert: value, updatedBy });
}

// ─── Books ───────────────────────────────────────────────────────────────────

export async function bankEntries({ db }: TenantScope) {
	return repo.listBankEntries(db);
}

export async function addBankEntry(
	{ db }: TenantScope,
	entry: { amount: number; description: string; date: Date },
	createdBy: string,
) {
	await repo.insertBankEntry(db, { ...entry, createdBy });
}

export async function deleteBankEntry({ db }: TenantScope, id: string) {
	await repo.deleteBankEntry(db, id);
}

export async function externalBills({ db }: TenantScope) {
	return repo.listExternalBills(db);
}

export async function addExternalBill(
	{ db }: TenantScope,
	bill: { creditor: string; description: string; amount: number },
	createdBy: string,
) {
	await repo.insertExternalBill(db, { ...bill, createdBy });
}

export async function markExternalBillPaid(
	{ db, now }: TenantScope,
	id: string,
) {
	await repo.markExternalBillPaid(db, id, now());
}

export async function deleteExternalBill({ db }: TenantScope, id: string) {
	await repo.deleteExternalBill(db, id);
}

// ─── Open bills ──────────────────────────────────────────────────────────────

/** Paid group bills the Kasse still lists, newest first (#25). */
const RECENT_PAID_GROUP_BILLS = 20;

/**
 * Every open group bill plus the newest paid ones. Group bills are never
 * carried, so there is no "Übertragen". Older paid ones stay in their
 * period under Rechnungen. The card shows no items, so none are loaded.
 */
export async function openEntityBills({ db }: TenantScope) {
	return repo.openGroupBills(db, RECENT_PAID_GROUP_BILLS);
}

export async function openMemberBills({ db }: TenantScope) {
	return repo.openMemberBills(db);
}

/**
 * "Alle haben gezahlt" (feature `billing.markAllPaid`): the same set the
 * Kasse lists as open, unpaid and deferred member bills. Group bills are
 * settled separately and stay untouched. A credit (negative total) is
 * nothing anybody paid: it stays open, so the next run carries it into the
 * member's bill (#220). Settles what paying each of them on its own settles
 * (the billing service's setBillStatus): the bill and the member's carried
 * bills created before it, all with the same paidAt, which links them for
 * an undo (see carried-bills). One atomic batch, so either every bill is
 * paid or none (#23).
 */
export async function markAllMemberBillsPaid({ db, now }: TenantScope) {
	return { count: await repo.payOpenMemberBills(db, now()) };
}

// ─── Payment target and sender ───────────────────────────────────────────────

/** The tenant's Getränke billing profile; empty when none is stored yet. */
export async function billingProfile({
	db,
}: TenantScope): Promise<GetraenkeBillingProfile> {
	return (await repo.billingProfile(db)) ?? EMPTY_GETRAENKE_BILLING_PROFILE;
}

/** Active Getränkekasse kontos, oldest first. */
export async function activeKontos({
	db,
}: TenantScope): Promise<GetraenkekasseKontoRow[]> {
	const rows = await repo.activeKontos(db);
	if (rows.some((k) => !isValidIban(k.iban))) {
		await log.warn("Getränkekasse konto with an invalid IBAN is ignored");
	}
	return rows;
}

/** Where members pay, or null while the tenant has not set it up. */
export async function payment(
	scope: TenantScope,
): Promise<GetraenkekassePayment | null> {
	const [paypal, kontos, profile] = await Promise.all([
		brandingPaypal(scope),
		activeKontos(scope),
		billingProfile(scope),
	]);
	return resolveGetraenkekassePayment(kontos, profile.accountHolder, paypal);
}

/** The payment target and the payment terms, for the open-bill banner. */
export async function paymentAndTerms(scope: TenantScope) {
	const [paypal, kontos, profile] = await Promise.all([
		brandingPaypal(scope),
		activeKontos(scope),
		billingProfile(scope),
	]);
	return {
		payment: resolveGetraenkekassePayment(
			kontos,
			profile.accountHolder,
			paypal,
		),
		paymentDueDays: profile.paymentDueDays,
	};
}

/** Everything a bill needs from the tenant, or what is still missing. */
export async function billSender(
	scope: TenantScope,
): Promise<GetraenkeBillSenderResult> {
	const [paypal, kontos, profile] = await Promise.all([
		brandingPaypal(scope),
		activeKontos(scope),
		billingProfile(scope),
	]);
	return resolveGetraenkeBillSender(kontos, profile, paypal);
}

export type GetraenkeBillingProfileInput = Pick<
	GetraenkeBillingProfile,
	| "senderName"
	| "senderStreet"
	| "senderCity"
	| "location"
	| "website"
	| "accountHolder"
	| "paymentDueDays"
>;

export type GetraenkeBillingSettings = {
	profile: GetraenkeBillingProfileInput;
	/** What members are asked to pay into, from the Getränkekasse konto. */
	payment: { iban: string; paypalBaseUrl: string | null } | null;
	/** Labels of what is still missing before billing can run. */
	missing: string[];
};

/** The sender, the account and what billing still misses, for the Kasse. */
export async function billingSettings(
	scope: TenantScope,
): Promise<GetraenkeBillingSettings> {
	const [paypal, kontos, profile] = await Promise.all([
		brandingPaypal(scope),
		activeKontos(scope),
		billingProfile(scope),
	]);
	const account = resolveGetraenkekasseAccount(kontos, paypal);
	const sender = resolveGetraenkeBillSender(kontos, profile, paypal);
	return {
		profile: {
			senderName: profile.senderName,
			senderStreet: profile.senderStreet,
			senderCity: profile.senderCity,
			location: profile.location,
			website: profile.website,
			accountHolder: profile.accountHolder,
			paymentDueDays: profile.paymentDueDays,
		},
		payment: account
			? { iban: account.iban, paypalBaseUrl: account.paypalBaseUrl }
			: null,
		missing: sender.ok ? [] : sender.missing,
	};
}

export async function saveBillingProfile(
	{ db }: TenantScope,
	profile: GetraenkeBillingProfileInput,
	updatedBy: string,
) {
	await repo.saveBillingProfile(db, { ...profile, updatedBy });
}

// ─── Drink settings (features) ───────────────────────────────────────────────

export type DrinkPricingConfig = {
	/** Whether the `drinks.markup` feature is on for this tenant. */
	enabled: boolean;
	/** Markup in percent; 0 while the feature is off. */
	markupPercent: number;
};

/**
 * The markup on drink prices. While `drinks.markup` is off it is 0, without
 * reading the config row.
 */
export async function drinkPricing(
	scope: TenantScope,
): Promise<DrinkPricingConfig> {
	if (!(await hasFeature(scope, "drinks.markup"))) {
		return { enabled: false, markupPercent: 0 };
	}
	const value = Number(
		(await repo.kasseSettings(scope.db))?.markupPercent ?? 0,
	);
	return {
		enabled: true,
		markupPercent: isValidMarkupPercent(value) ? value : 0,
	};
}

export type BillRecipient =
	| { mode: "members" }
	| { mode: "treasurer"; email: string };

/**
 * Who gets the mails for a new billing run. Falls back to the members when
 * the feature is off or no treasurer address has been saved.
 */
export async function billRecipient(
	scope: TenantScope,
): Promise<BillRecipient> {
	if (!(await hasFeature(scope, "billing.treasurerRecipient"))) {
		return { mode: "members" };
	}
	const row = await repo.kasseSettings(scope.db);
	const email = row?.treasurerEmail?.trim();
	if (row?.billRecipient === "treasurer" && email) {
		return { mode: "treasurer", email };
	}
	return { mode: "members" };
}

export type GetraenkeSettings = {
	markupPercent: number;
	billRecipient: "members" | "treasurer";
	treasurerEmail: string;
};

/** The values behind both features, or null when the tenant has neither. */
export async function getraenkeSettings(
	scope: TenantScope,
): Promise<GetraenkeSettings | null> {
	const [markup, treasurer] = await Promise.all([
		hasFeature(scope, "drinks.markup"),
		hasFeature(scope, "billing.treasurerRecipient"),
	]);
	if (!markup && !treasurer) {
		return null;
	}
	const row = await repo.kasseSettings(scope.db);
	return {
		markupPercent: Number(row?.markupPercent ?? 0),
		billRecipient: row?.billRecipient ?? "members",
		treasurerEmail: row?.treasurerEmail ?? "",
	};
}

export async function setMarkupPercent(
	{ db }: TenantScope,
	value: number,
	updatedBy: string,
) {
	await repo.saveKasseSettings(db, { markupPercent: value, updatedBy });
}

/** Saves who gets the bill mails; the treasurer mode needs an address. */
export async function setBillRecipient(
	{ db }: TenantScope,
	mode: "members" | "treasurer",
	treasurerEmail: string,
	updatedBy: string,
) {
	const email = treasurerEmail.trim();
	if (email && !z.string().email().safeParse(email).success) {
		throw new ValidationError("Ungültige E-Mail-Adresse");
	}
	if (mode === "treasurer" && !email) {
		throw new ValidationError(
			"Bitte die E-Mail-Adresse des Kassenwarts eintragen.",
		);
	}
	await repo.saveKasseSettings(db, {
		billRecipient: mode,
		treasurerEmail: email || null,
		updatedBy,
	});
}
