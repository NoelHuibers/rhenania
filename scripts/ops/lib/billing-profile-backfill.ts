// scripts/ops/lib/billing-profile-backfill.ts — move Rhenania's Getränke bill
// sender and account out of the code into its tenant DB (#9).
//
// Until #9 the bill PDF and the profile page fell back to hard-coded values
// whenever a tenant had no (valid) Getränkekasse konto, and the sender and
// account holder were always hard-coded. The app now reads them only from
// `getraenke_billing_config` and the konto. This backfill writes exactly the
// values Rhenania was shown before, so its bills stay identical.
//
// Kept free of env/CLI concerns so it can be tested against local DBs; the
// entry point is scripts/ops/backfill-billing-profile.ts.

import { and, eq, sql } from "drizzle-orm";

import { isValidIban, normalizeIban } from "~/lib/iban";
import { normalizePaypalLink } from "~/lib/paypal";
import type { TenantBranding } from "~/server/db/control-schema";
import { getraenkeBillingConfig, kontos } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";
import {
	type GetraenkekassePayment,
	resolveGetraenkekassePayment,
} from "~/server/domain/getraenkekasse/payment";

/** The values the code used for Rhenania before #9. */
export const RHENANIA_LEGACY_BILLING = {
	senderName: "Noel Huibers",
	senderStreet: "Unterbibergerstraße 72",
	senderCity: "81737 München",
	location: "München",
	website: "www.rhenania-stuttgart.de/trinken",
	accountHolder: "Noel Huibers",
	paymentDueDays: 14,
	iban: "DE65 5002 4024 3386 7890 30",
	paypalBaseUrl: "https://paypal.me/CorpsRhenaniaBier",
} as const;

type ProfileField =
	| "senderName"
	| "senderStreet"
	| "senderCity"
	| "location"
	| "website"
	| "accountHolder";

const PROFILE_FIELDS: ProfileField[] = [
	"senderName",
	"senderStreet",
	"senderCity",
	"location",
	"website",
	"accountHolder",
];

export type BackfillStep =
	| { kind: "insert-profile"; values: Record<ProfileField, string> }
	| { kind: "fill-profile"; values: Partial<Record<ProfileField, string>> }
	| { kind: "insert-konto"; iban: string; paypalLink: string | null }
	| { kind: "set-konto-paypal"; kontoId: string; paypalLink: string };

export type BackfillPlan = {
	steps: BackfillStep[];
	/** What the old code showed (IBAN, holder, PayPal). */
	before: GetraenkekassePayment;
	/** What the new code shows once the steps are applied. */
	after: GetraenkekassePayment | null;
	/** True when `after` equals `before`; the plan is only applied then. */
	unchanged: boolean;
	warnings: string[];
};

type KontoRow = {
	id: string;
	iban: string;
	paypalLink: string | null;
	createdAt: Date;
};

/** The old resolver, verbatim apart from the reads (pre-#9 behaviour). */
function legacyPayment(
	firstActiveKonto: KontoRow | undefined,
	branding: TenantBranding | null,
): GetraenkekassePayment {
	const kontoIban =
		firstActiveKonto?.iban && isValidIban(firstActiveKonto.iban)
			? firstActiveKonto.iban
			: null;
	const iban = kontoIban ?? RHENANIA_LEGACY_BILLING.iban;
	const rawPaypal =
		firstActiveKonto?.paypalLink ??
		branding?.paypalUrl ??
		RHENANIA_LEGACY_BILLING.paypalBaseUrl;
	return resolveGetraenkekassePayment(
		[{ iban, paypalLink: rawPaypal }],
		RHENANIA_LEGACY_BILLING.accountHolder,
	) as GetraenkekassePayment;
}

type Planned = { steps: BackfillStep[]; warnings: string[] };

/** Profile steps; returns the account holder the new code will print. */
function planProfile(
	profile: typeof getraenkeBillingConfig.$inferSelect | undefined,
	branding: TenantBranding | null,
	out: Planned,
): string {
	const legacyProfile: Record<ProfileField, string> = {
		senderName: RHENANIA_LEGACY_BILLING.senderName,
		senderStreet: RHENANIA_LEGACY_BILLING.senderStreet,
		senderCity: RHENANIA_LEGACY_BILLING.senderCity,
		location: RHENANIA_LEGACY_BILLING.location,
		website: branding?.billingWebsite ?? RHENANIA_LEGACY_BILLING.website,
		accountHolder: RHENANIA_LEGACY_BILLING.accountHolder,
	};
	if (!profile) {
		out.steps.push({ kind: "insert-profile", values: legacyProfile });
		return legacyProfile.accountHolder;
	}
	const fill: Partial<Record<ProfileField, string>> = {};
	for (const field of PROFILE_FIELDS) {
		if (!profile[field].trim()) {
			fill[field] = legacyProfile[field];
		} else if (profile[field] !== legacyProfile[field]) {
			out.warnings.push(
				`${field} is already set to "${profile[field]}"; kept as is.`,
			);
		}
	}
	if (Object.keys(fill).length > 0) {
		out.steps.push({ kind: "fill-profile", values: fill });
	}
	if (profile.paymentDueDays !== RHENANIA_LEGACY_BILLING.paymentDueDays) {
		out.warnings.push(
			`paymentDueDays is ${profile.paymentDueDays}; the old bills said ${RHENANIA_LEGACY_BILLING.paymentDueDays}.`,
		);
	}
	return profile.accountHolder.trim() || legacyProfile.accountHolder;
}

/** Konto steps; returns the active kontos as they will be, oldest first. */
function planKonto(
	active: KontoRow[],
	branding: TenantBranding | null,
	out: Planned,
): KontoRow[] {
	const first = active[0];
	const simulated = active.map((k) => ({ ...k }));
	if (first && isValidIban(first.iban)) {
		if (first.paypalLink == null && !branding?.paypalUrl) {
			const paypalLink = RHENANIA_LEGACY_BILLING.paypalBaseUrl;
			out.steps.push({
				kind: "set-konto-paypal",
				kontoId: first.id,
				paypalLink,
			});
			simulated[0] = { ...first, paypalLink };
		}
	} else {
		// No usable konto: the old code showed the built-in account.
		const paypalLink =
			first?.paypalLink ??
			(branding?.paypalUrl ? null : RHENANIA_LEGACY_BILLING.paypalBaseUrl);
		const iban = normalizeIban(RHENANIA_LEGACY_BILLING.iban);
		out.steps.push({ kind: "insert-konto", iban, paypalLink });
		simulated.push({
			id: "new",
			iban,
			paypalLink,
			createdAt: new Date(8.64e15),
		});
		if (first) {
			out.warnings.push(
				`Active Getränkekasse konto ${first.id} has an invalid IBAN; it stays and is ignored.`,
			);
		}
	}
	return simulated.sort(
		(a, b) => a.createdAt.getTime() - b.createdAt.getTime(),
	);
}

/**
 * Works out what to write so the new code shows what the old one did.
 * Never overwrites a value somebody already entered.
 */
export async function planBillingProfileBackfill(
	tdb: TenantDb,
	branding: TenantBranding | null,
): Promise<BackfillPlan> {
	const out: Planned = { steps: [], warnings: [] };

	const [profile] = await tdb
		.select()
		.from(getraenkeBillingConfig)
		.where(eq(getraenkeBillingConfig.id, "singleton"))
		.limit(1);
	const holder = planProfile(profile, branding, out);

	// The old code read one active konto in table order (`LIMIT 1`).
	const active: KontoRow[] = await tdb
		.select({
			id: kontos.id,
			iban: kontos.iban,
			paypalLink: kontos.paypalLink,
			createdAt: kontos.createdAt,
		})
		.from(kontos)
		.where(
			and(eq(kontos.kasseType, "Getränkekasse"), eq(kontos.isActive, true)),
		)
		.orderBy(sql`rowid`);
	const before = legacyPayment(active[0], branding);
	const after = resolveGetraenkekassePayment(
		planKonto(active, branding, out),
		holder,
		branding?.paypalUrl,
	);

	const unchanged =
		after !== null &&
		after.ibanRaw === before.ibanRaw &&
		after.accountHolder === before.accountHolder &&
		after.paypalBaseUrl === before.paypalBaseUrl;
	if (!unchanged) {
		out.warnings.push(
			"The bills would change after the backfill; nothing is written. Check the kontos and the profile by hand.",
		);
	}
	return { ...out, before, after, unchanged };
}

/** Writes the plan in one transaction. Refuses a plan that changes bills. */
export async function applyBillingProfileBackfill(
	tdb: TenantDb,
	plan: BackfillPlan,
): Promise<void> {
	if (!plan.unchanged) {
		throw new Error("Refusing to apply a backfill that changes the bills.");
	}
	await tdb.transaction(async (tx) => {
		for (const step of plan.steps) {
			switch (step.kind) {
				case "insert-profile":
					await tx
						.insert(getraenkeBillingConfig)
						.values({
							id: "singleton",
							...step.values,
							paymentDueDays: RHENANIA_LEGACY_BILLING.paymentDueDays,
						})
						.onConflictDoNothing();
					break;
				case "fill-profile":
					await tx
						.update(getraenkeBillingConfig)
						.set(step.values)
						.where(eq(getraenkeBillingConfig.id, "singleton"));
					break;
				case "insert-konto":
					await tx.insert(kontos).values({
						kasseType: "Getränkekasse",
						iban: step.iban,
						// Unknown to the old code; the Kassenwart can add them in Konten.
						bic: "",
						bankName: "",
						paypalLink: step.paypalLink,
						description: "Übernommen aus dem bisherigen Standardkonto (#9)",
						isActive: true,
					});
					break;
				case "set-konto-paypal":
					await tx
						.update(kontos)
						.set({ paypalLink: step.paypalLink })
						.where(eq(kontos.id, step.kontoId));
					break;
			}
		}
	});
}

/** One line per step, for the dry-run output. */
export function describeStep(step: BackfillStep): string {
	switch (step.kind) {
		case "insert-profile":
			return `create getraenke_billing_config: ${JSON.stringify(step.values)}`;
		case "fill-profile":
			return `fill empty getraenke_billing_config fields: ${JSON.stringify(step.values)}`;
		case "insert-konto":
			return `insert active Getränkekasse konto ${step.iban} (PayPal ${step.paypalLink ? normalizePaypalLink(step.paypalLink) : "from branding"})`;
		case "set-konto-paypal":
			return `set PayPal of konto ${step.kontoId} to ${step.paypalLink}`;
	}
}
