"use server";

import {
	and,
	desc,
	eq,
	exists,
	gt,
	gte,
	inArray,
	ne,
	or,
	sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { z } from "zod";
import { isValidMarkupPercent, MAX_MARKUP_PERCENT } from "~/lib/pricing";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import {
	bankEntries,
	bills,
	externalBills,
	getraenkeBillingConfig,
	inventories,
	inventoryItems,
	kasseConfig,
	roles,
	userRoles,
} from "~/server/db/schema";
import { ROLES, requireRole } from "~/server/lib/authz";
import { ActionError, defineAction } from "~/server/lib/define-action";
import { hasFeature } from "~/server/lib/features";
import {
	getGetraenkeBillingProfile,
	getGetraenkekasseAccount,
	resolveGetraenkeBillSender,
} from "~/server/lib/getraenkekasse-payment";
import { billPdf } from "~/server/modules/billing/service";

// ─── Summary ──────────────────────────────────────────────────────────────────

/** SUM of bill totals with this status; group bills belong to `event-…` users. */
function sumBills(status: "Unbezahlt" | "Gestundet", group: boolean) {
	const isGroup = group
		? sql`${bills.userId} LIKE 'event-%'`
		: sql`${bills.userId} NOT LIKE 'event-%'`;
	return sql<number>`COALESCE(SUM(CASE WHEN ${bills.status} = ${status} AND ${isGroup} THEN ${bills.total} END), 0)`;
}

export async function getKasseSummary() {
	await requireRole(ROLES.getraenke);
	const [
		kassenstand,
		lagerwert,
		// Member and group bills, each split into Unbezahlt and Gestundet
		offeneRechnungen,
		externOffen,
		pfand,
	] = await Promise.all([
		// Sum of all bank entries
		db
			.select({ total: sql<number>`COALESCE(SUM(${bankEntries.amount}), 0)` })
			.from(bankEntries)
			.then((r) => Number(r[0]?.total ?? 0)),

		// Value of last closed inventory: SUM(countedStock * priceAtCount)
		(async () => {
			const [lastClosed] = await db
				.select({ id: inventories.id, closedAt: inventories.closedAt })
				.from(inventories)
				.where(eq(inventories.status, "closed"))
				.orderBy(desc(inventories.closedAt))
				.limit(1);
			if (!lastClosed) {
				return { value: 0, date: null as Date | null };
			}
			const items = await db
				.select({
					counted: inventoryItems.countedStock,
					price: inventoryItems.priceAtCount,
				})
				.from(inventoryItems)
				.where(eq(inventoryItems.inventoryId, lastClosed.id));
			const value = items.reduce((sum, i) => sum + i.counted * i.price, 0);
			return { value, date: lastClosed.closedAt };
		})(),

		// Open member and group bills, split into due (Unbezahlt) and deferred
		// (Gestundet). Both are still owed to the Kasse; the overview shows
		// them on separate lines so they add up to the open lists.
		db
			.select({
				mitglieder: sumBills("Unbezahlt", false),
				gestundetMitglieder: sumBills("Gestundet", false),
				gruppen: sumBills("Unbezahlt", true),
				gestundetGruppen: sumBills("Gestundet", true),
			})
			.from(bills)
			.then((r) => ({
				mitglieder: Number(r[0]?.mitglieder ?? 0),
				gestundetMitglieder: Number(r[0]?.gestundetMitglieder ?? 0),
				gruppen: Number(r[0]?.gruppen ?? 0),
				gestundetGruppen: Number(r[0]?.gestundetGruppen ?? 0),
			})),

		// Open external bills
		db
			.select({
				total: sql<number>`COALESCE(SUM(${externalBills.amount}), 0)`,
			})
			.from(externalBills)
			.where(eq(externalBills.status, "Offen"))
			.then((r) => Number(r[0]?.total ?? 0)),

		// Pfand from config
		db
			.select({ pfandWert: kasseConfig.pfandWert })
			.from(kasseConfig)
			.where(eq(kasseConfig.id, "singleton"))
			.then((r) => Number(r[0]?.pfandWert ?? 0)),
	]);

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

// ─── Bank Entries ─────────────────────────────────────────────────────────────

export async function getBankEntries() {
	await requireRole(ROLES.getraenke);
	return db.select().from(bankEntries).orderBy(desc(bankEntries.date));
}

const INVALID_BANK_ENTRY = "Ungültiger Betrag oder Datum";

export const addBankEntry = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z.object({
				amount: z.number({ error: INVALID_BANK_ENTRY }),
				description: z.string(),
				date: z.date({ error: INVALID_BANK_ENTRY }),
			}),
		]),
		errorMessage: "Fehler beim Hinzufügen",
	},
	async ([data], { user }) => {
		await db.insert(bankEntries).values({
			amount: data.amount,
			description: data.description,
			date: data.date,
			createdBy: user.id,
		});
	},
);

export const deleteBankEntry = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([id]) => {
		await db.delete(bankEntries).where(eq(bankEntries.id, id));
	},
);

// ─── External Bills ───────────────────────────────────────────────────────────

export async function getExternalBills() {
	await requireRole(ROLES.getraenke);
	return db.select().from(externalBills).orderBy(desc(externalBills.createdAt));
}

export const addExternalBill = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z.object({
				creditor: z.string(),
				description: z.string(),
				amount: z
					.number({ error: "Ungültiger Betrag" })
					.positive("Ungültiger Betrag"),
			}),
		]),
		errorMessage: "Fehler beim Hinzufügen",
	},
	async ([data], { user }) => {
		await db.insert(externalBills).values({
			creditor: data.creditor,
			description: data.description,
			amount: data.amount,
			createdBy: user.id,
		});
	},
);

export const markExternalBillPaid = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "Status konnte nicht geändert werden",
	},
	async ([id]) => {
		await db
			.update(externalBills)
			.set({ status: "Bezahlt", paidAt: new Date() })
			.where(eq(externalBills.id, id));
	},
);

export const deleteExternalBill = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "Fehler beim Löschen",
	},
	async ([id]) => {
		await db.delete(externalBills).where(eq(externalBills.id, id));
	},
);

// ─── Pfand ────────────────────────────────────────────────────────────────────

export async function getPfandWert() {
	await requireRole(ROLES.getraenke);
	const [row] = await db
		.select({ pfandWert: kasseConfig.pfandWert })
		.from(kasseConfig)
		.where(eq(kasseConfig.id, "singleton"));
	return Number(row?.pfandWert ?? 0);
}

export const setPfandWert = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([
			z
				.number({ error: "Ungültiger Pfandwert" })
				.min(0, "Ungültiger Pfandwert"),
		]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([value], { user }) => {
		await db
			.insert(kasseConfig)
			.values({ id: "singleton", pfandWert: value, updatedBy: user.id })
			.onConflictDoUpdate({
				target: kasseConfig.id,
				set: { pfandWert: value, updatedBy: user.id },
			});
	},
);

// ─── Open entity bills (for PDF download) ────────────────────────────────────

/** Paid group bills the Kasse still lists, newest first (#25). */
const RECENT_PAID_GROUP_BILLS = 20;

// Every open (Unbezahlt or Gestundet) group bill plus the newest paid ones,
// in one query. Group bills are never carried, so there is no "Übertragen".
// Older paid ones stay in their period under Rechnungen. The card shows no
// items, so none are loaded.
export async function getOpenEntityBills() {
	await requireRole(ROLES.getraenke);
	const isGroupBill = sql`${bills.userId} LIKE 'event-%'`;
	// Bills of one run share createdAt: newest inserted first, the same
	// order whichever index SQLite picks.
	const newestFirst = [desc(bills.createdAt), desc(sql`${bills}.rowid`)];
	const recentPaid = db
		.select({ id: bills.id })
		.from(bills)
		// Unary + keeps SQLite off bill_status_idx, which would walk every
		// paid member bill; the group bills come from bill_user_nocase_idx.
		.where(and(isGroupBill, sql`+${bills.status} = 'Bezahlt'`))
		.orderBy(...newestFirst)
		.limit(RECENT_PAID_GROUP_BILLS);
	return db
		.select({
			id: bills.id,
			userName: bills.userName,
			total: bills.total,
			status: bills.status,
			createdAt: bills.createdAt,
		})
		.from(bills)
		.where(
			and(
				isGroupBill,
				or(ne(bills.status, "Bezahlt"), inArray(bills.id, recentPaid)),
			),
		)
		.orderBy(...newestFirst);
}

// ─── Open member bills ────────────────────────────────────────────────────────

export async function getOpenMemberBills() {
	await requireRole(ROLES.getraenke);
	return db
		.select({
			id: bills.id,
			userName: bills.userName,
			total: bills.total,
			status: bills.status,
			createdAt: bills.createdAt,
		})
		.from(bills)
		.where(
			sql`(${bills.status} = 'Unbezahlt' OR ${bills.status} = 'Gestundet') AND ${bills.userId} NOT LIKE 'event-%'`,
		)
		.orderBy(bills.userName);
}

// ─── PDF download for entity bills (Getränkewart only) ───────────────────────

async function hasGetraenkewartRole(userId: string): Promise<boolean> {
	const [row] = await db
		.select({ roleId: userRoles.roleId })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(
			sql`${userRoles.userId} = ${userId} AND (${roles.name} = 'Getränkewart' OR ${roles.name} = 'Admin')`,
		)
		.limit(1);
	return !!row;
}

export const downloadEntityBillPDF = defineAction(
	{
		roles: ROLES.getraenke,
		schema: z.tuple([z.string()]),
		errorMessage: "PDF-Generierung fehlgeschlagen",
	},
	async ([billId], { tenant }) => {
		const { pdf, fileName } = await billPdf(tenant, billId);
		return { base64: pdf.toString("base64"), fileName };
	},
);

// ─── Feature settings (markup, bill recipient) ───────────────────────────────
//
// Values behind the `drinks.markup` and `billing.treasurerRecipient` features.
// Every action checks the Getränkewart/Admin role AND the feature flag on the
// server — hiding the card in the UI is not the gate.

async function requireGetraenkewart(): Promise<
	{ ok: true; userId: string } | { ok: false; error: string }
> {
	const session = await auth();
	if (!session?.user?.id) {
		return { ok: false, error: "Nicht angemeldet" };
	}
	if (!(await hasGetraenkewartRole(session.user.id))) {
		return { ok: false, error: "Keine Berechtigung" };
	}
	return { ok: true, userId: session.user.id };
}

export type GetraenkeSettings = {
	markupPercent: number;
	billRecipient: "members" | "treasurer";
	treasurerEmail: string;
};

/** Current values, or null when the tenant has neither feature. */
export async function getGetraenkeSettings(): Promise<GetraenkeSettings | null> {
	await requireRole(ROLES.getraenke);
	const [markup, treasurer] = await Promise.all([
		hasFeature("drinks.markup"),
		hasFeature("billing.treasurerRecipient"),
	]);
	if (!markup && !treasurer) {
		return null;
	}

	const [row] = await db
		.select({
			markupPercent: kasseConfig.markupPercent,
			billRecipient: kasseConfig.billRecipient,
			treasurerEmail: kasseConfig.treasurerEmail,
		})
		.from(kasseConfig)
		.where(eq(kasseConfig.id, "singleton"));

	return {
		markupPercent: Number(row?.markupPercent ?? 0),
		billRecipient: row?.billRecipient ?? "members",
		treasurerEmail: row?.treasurerEmail ?? "",
	};
}

const INVALID_MARKUP = `Der Aufschlag muss zwischen 0 und ${MAX_MARKUP_PERCENT} % liegen.`;

export const setMarkupPercent = defineAction(
	{
		roles: ROLES.getraenke,
		feature: "drinks.markup",
		schema: z.tuple([
			z
				.number({ error: INVALID_MARKUP })
				.refine(isValidMarkupPercent, INVALID_MARKUP),
		]),
	},
	async ([value], { user }) => {
		await db
			.insert(kasseConfig)
			.values({ id: "singleton", markupPercent: value, updatedBy: user.id })
			.onConflictDoUpdate({
				target: kasseConfig.id,
				set: { markupPercent: value, updatedBy: user.id },
			});
	},
);

export const setBillRecipient = defineAction(
	{
		roles: ROLES.getraenke,
		feature: "billing.treasurerRecipient",
		schema: z.tuple([
			z.enum(["members", "treasurer"], { error: "Ungültiger Empfänger" }),
			z.string(),
		]),
	},
	async ([mode, treasurerEmail], { user }) => {
		const email = treasurerEmail.trim();
		if (email && !z.string().email().safeParse(email).success) {
			throw new ActionError("Ungültige E-Mail-Adresse", "INVALID_INPUT");
		}
		if (mode === "treasurer" && !email) {
			throw new ActionError(
				"Bitte die E-Mail-Adresse des Kassenwarts eintragen.",
				"INVALID_INPUT",
			);
		}

		const values = { billRecipient: mode, treasurerEmail: email || null };
		await db
			.insert(kasseConfig)
			.values({ id: "singleton", ...values, updatedBy: user.id })
			.onConflictDoUpdate({
				target: kasseConfig.id,
				set: { ...values, updatedBy: user.id },
			});
	},
);

// ─── Absender und Konto der Getränkerechnungen ──────────────────────────────
//
// The letterhead and account holder of the bill PDF. Billing refuses to run
// until they and an active Getränkekasse konto are set up.

const billingProfileSchema = z.object({
	senderName: z.string().trim().max(255),
	senderStreet: z.string().trim().max(255),
	senderCity: z.string().trim().max(255),
	location: z.string().trim().max(255),
	website: z.string().trim().max(255),
	accountHolder: z.string().trim().max(255),
	paymentDueDays: z
		.number()
		.int()
		.min(1, "Zahlungsziel: 1 bis 90 Tage")
		.max(90, "Zahlungsziel: 1 bis 90 Tage"),
});

export type GetraenkeBillingProfileInput = z.infer<typeof billingProfileSchema>;

export type GetraenkeBillingSettings = {
	profile: GetraenkeBillingProfileInput;
	/** What members are asked to pay into, from the Getränkekasse konto. */
	payment: { iban: string; paypalBaseUrl: string | null } | null;
	/** Labels of what is still missing before billing can run. */
	missing: string[];
};

/** For the Getränkewart only; null for everybody else. */
export async function getGetraenkeBillingSettings(): Promise<GetraenkeBillingSettings | null> {
	const gate = await requireGetraenkewart();
	if (!gate.ok) {
		return null;
	}
	const [profile, account, sender] = await Promise.all([
		getGetraenkeBillingProfile(),
		getGetraenkekasseAccount(),
		resolveGetraenkeBillSender(),
	]);
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

export const updateGetraenkeBillingProfile = defineAction(
	{ roles: ROLES.getraenke, schema: z.tuple([billingProfileSchema]) },
	async ([profile], { user }) => {
		const values = { ...profile, updatedBy: user.id };
		await db
			.insert(getraenkeBillingConfig)
			.values({ id: "singleton", ...values })
			.onConflictDoUpdate({ target: getraenkeBillingConfig.id, set: values });
	},
);

// ─── "Alle haben gezahlt" (feature `billing.markAllPaid`) ────────────────────

export const markAllMemberBillsPaid = defineAction(
	{
		roles: ROLES.getraenke,
		feature: "billing.markAllPaid",
		errorMessage:
			"Fehler beim Markieren als bezahlt. Es wurde nichts geändert.",
	},
	async () => {
		// Same set the Kasse lists as open: unpaid and deferred member bills.
		// Group bills are settled separately and stay untouched. A credit
		// (negative total) is nothing anybody paid: it stays open, so the next
		// run carries it into the member's bill (#220). Settles what
		// paying each of them on its own settles (updateBillStatus): the bill and
		// the member's carried bills created before it, all with the same paidAt,
		// which links them for an undo (see carried-bills). One atomic batch, so
		// either every bill is paid or none (#23).
		const isOpenMemberBill = and(
			inArray(bills.status, ["Unbezahlt", "Gestundet"]),
			sql`${bills.userId} NOT LIKE 'event-%'`,
			gte(bills.total, 0),
		);
		const later = alias(bills, "later");
		const now = new Date();
		const paid = { status: "Bezahlt" as const, paidAt: now, updatedAt: now };
		const [, settled] = await db.batch([
			// Carried bills first, while the bills they were carried into are
			// still open.
			db
				.update(bills)
				.set(paid)
				.where(
					and(
						eq(bills.status, "Übertragen"),
						exists(
							db
								.select({ one: sql`1` })
								.from(later)
								.where(
									and(
										eq(later.userId, bills.userId),
										inArray(later.status, ["Unbezahlt", "Gestundet"]),
										sql`${later.userId} NOT LIKE 'event-%'`,
										gte(later.total, 0),
										gt(later.createdAt, bills.createdAt),
									),
								),
						),
					),
				),
			db
				.update(bills)
				.set(paid)
				.where(isOpenMemberBill)
				.returning({ id: bills.id }),
		]);
		return { count: settled.length };
	},
);
