// getraenkekasse-payment.ts — where members pay their drink bills, and who
// sends the bill.
//
// Single source of truth for the bank account, PayPal link and sender shown
// on the bill PDF and on the profile page. Everything comes from the tenant's
// own data; there is no built-in fallback, so a tenant that has not set up
// its Getränkekasse never sends members to somebody else's account.
//
//   - IBAN: the first active Getränkekasse `konto` with a valid IBAN.
//   - PayPal: that konto → tenant branding → none.
//   - Account holder and sender: `getraenke_billing_config` (edited by the
//     Getränkewart in Getränkewart › Kasse).

import { and, asc, eq, sql } from "drizzle-orm";

import { formatIban, isValidIban, normalizeIban } from "~/lib/iban";
import { normalizePaypalLink } from "~/lib/paypal";
import { db } from "~/server/db";
import { getraenkeBillingConfig, kontos } from "~/server/db/schema";
import { getCurrentTenant } from "~/server/lib/tenant-context";

/** Shown when billing or a bill PDF is refused for missing data. */
export const GETRAENKE_BILLING_INCOMPLETE =
	"Bitte Absender und Konto in der Kasse hinterlegen";

export type GetraenkekassePayment = {
	/** Display form, grouped in blocks of four. */
	iban: string;
	/** Without spaces, for copy buttons and EPC QR codes. */
	ibanRaw: string;
	accountHolder: string;
	/** Canonical paypal.me URL without trailing slash, or null if none. */
	paypalBaseUrl: string | null;
};

export type GetraenkeBillingProfile =
	typeof getraenkeBillingConfig.$inferSelect;

export const EMPTY_GETRAENKE_BILLING_PROFILE: GetraenkeBillingProfile = {
	id: "singleton",
	senderName: "",
	senderStreet: "",
	senderCity: "",
	location: "",
	website: "",
	accountHolder: "",
	paymentDueDays: 14,
	updatedAt: null,
	updatedBy: null,
};

export type GetraenkekasseKontoRow = {
	iban: string;
	paypalLink: string | null;
};

/**
 * Pure resolution of the payment target from the tenant's active
 * Getränkekasse kontos (oldest first), the configured account holder and the
 * branding PayPal. Null when there is no valid IBAN or no holder.
 */
export function resolveGetraenkekassePayment(
	activeKontos: GetraenkekasseKontoRow[],
	accountHolder: string,
	brandingPaypal?: string | null,
): GetraenkekassePayment | null {
	const account = resolveGetraenkekasseAccount(activeKontos, brandingPaypal);
	const holder = accountHolder.trim();
	return account && holder ? { ...account, accountHolder: holder } : null;
}

/** IBAN and PayPal alone (without the holder), or null without a valid IBAN. */
export function resolveGetraenkekasseAccount(
	activeKontos: GetraenkekasseKontoRow[],
	brandingPaypal?: string | null,
): Omit<GetraenkekassePayment, "accountHolder"> | null {
	// A mistyped konto IBAN must never reach members as a payment target.
	const konto = activeKontos.find((k) => isValidIban(k.iban));
	if (!konto) {
		return null;
	}
	const rawPaypal = konto.paypalLink?.trim() || brandingPaypal?.trim() || null;
	return {
		iban: formatIban(konto.iban),
		ibanRaw: normalizeIban(konto.iban),
		paypalBaseUrl: rawPaypal ? normalizePaypalLink(rawPaypal) : null,
	};
}

/** The tenant's Getränke billing profile; empty when none is stored yet. */
export async function getGetraenkeBillingProfile(): Promise<GetraenkeBillingProfile> {
	try {
		const [row] = await db
			.select()
			.from(getraenkeBillingConfig)
			.where(eq(getraenkeBillingConfig.id, "singleton"))
			.limit(1);
		return row ?? EMPTY_GETRAENKE_BILLING_PROFILE;
	} catch (error) {
		// Before the migration has run the table does not exist; treat that as
		// "not configured" so billing refuses instead of crashing.
		console.error("Error loading Getränke billing profile:", error);
		return EMPTY_GETRAENKE_BILLING_PROFILE;
	}
}

/** Active Getränkekasse kontos, oldest first. */
export async function getActiveGetraenkekasseKontos(): Promise<
	GetraenkekasseKontoRow[]
> {
	const rows = await db
		.select({ iban: kontos.iban, paypalLink: kontos.paypalLink })
		.from(kontos)
		.where(
			and(eq(kontos.kasseType, "Getränkekasse"), eq(kontos.isActive, true)),
		)
		.orderBy(asc(kontos.createdAt), sql`rowid`);
	if (rows.some((k) => !isValidIban(k.iban))) {
		console.warn("Getränkekasse konto with an invalid IBAN is ignored.");
	}
	return rows;
}

/** The Getränkekasse account (IBAN, PayPal) without the holder. */
export async function getGetraenkekasseAccount() {
	const [tenant, activeKontos] = await Promise.all([
		getCurrentTenant(),
		getActiveGetraenkekasseKontos(),
	]);
	return resolveGetraenkekasseAccount(
		activeKontos,
		tenant?.branding?.paypalUrl,
	);
}

/** Where members pay, or null while the tenant has not set it up. */
export async function getGetraenkekassePayment(): Promise<GetraenkekassePayment | null> {
	const [tenant, activeKontos, profile] = await Promise.all([
		getCurrentTenant(),
		getActiveGetraenkekasseKontos(),
		getGetraenkeBillingProfile(),
	]);
	return resolveGetraenkekassePayment(
		activeKontos,
		profile.accountHolder,
		tenant?.branding?.paypalUrl,
	);
}

export type GetraenkeBillSender = {
	name: string;
	street: string;
	city: string;
	/** Place in the date line of the letter. */
	location: string;
	website: string;
	paymentDueDays: number;
	payment: GetraenkekassePayment;
};

export type GetraenkeBillSenderResult =
	| { ok: true; sender: GetraenkeBillSender }
	| { ok: false; missing: string[] };

/** The city line without its leading postcode. */
function placeFromCity(city: string): string {
	return city.replace(/^\s*\d{4,5}\s+/, "").trim();
}

/**
 * Everything a bill needs from the tenant. Lists the missing pieces (German
 * labels for the Getränkewart) when the setup is incomplete.
 */
export async function resolveGetraenkeBillSender(): Promise<GetraenkeBillSenderResult> {
	const [tenant, activeKontos, profile] = await Promise.all([
		getCurrentTenant(),
		getActiveGetraenkekasseKontos(),
		getGetraenkeBillingProfile(),
	]);
	const payment = resolveGetraenkekassePayment(
		activeKontos,
		profile.accountHolder,
		tenant?.branding?.paypalUrl,
	);

	const name = profile.senderName.trim();
	const street = profile.senderStreet.trim();
	const city = profile.senderCity.trim();
	const missing: string[] = [];
	if (!name) {
		missing.push("Absender");
	}
	if (!street) {
		missing.push("Straße");
	}
	if (!city) {
		missing.push("PLZ und Ort");
	}
	if (!profile.accountHolder.trim()) {
		missing.push("Kontoinhaber");
	}
	if (!activeKontos.some((k) => isValidIban(k.iban))) {
		missing.push("Getränkekasse-Konto mit gültiger IBAN");
	}
	if (!payment || missing.length > 0) {
		return { ok: false, missing };
	}

	return {
		ok: true,
		sender: {
			name,
			street,
			city,
			location: profile.location.trim() || placeFromCity(city),
			website: profile.website.trim(),
			paymentDueDays: profile.paymentDueDays,
			payment,
		},
	};
}

/** The refusal message including what is missing. */
export function incompleteBillingMessage(missing: string[]): string {
	return missing.length > 0
		? `${GETRAENKE_BILLING_INCOMPLETE} (fehlt: ${missing.join(", ")}).`
		: `${GETRAENKE_BILLING_INCOMPLETE}.`;
}
