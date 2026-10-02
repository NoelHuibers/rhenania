// getraenkekasse-payment.ts — where members pay their drink bills.
//
// Single source of truth for the bank account and PayPal link shown on the
// bill PDF and on the profile page. Both used to resolve these separately
// (the profile from hard-coded constants), so they could drift apart.
//
// Resolution order:
//   - IBAN: active Getränkekasse `konto`, if its IBAN is valid; else default.
//   - PayPal: active Getränkekasse `konto` → tenant branding → default.
//   - Account holder: not yet stored per konto, so always the default.

import { and, eq } from "drizzle-orm";

import { formatIban, isValidIban, normalizeIban } from "~/lib/iban";
import { normalizePaypalLink } from "~/lib/paypal";
import { db } from "~/server/db";
import { kontos } from "~/server/db/schema";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export type GetraenkekassePayment = {
	/** Display form, grouped in blocks of four. */
	iban: string;
	/** Without spaces, for copy buttons and EPC QR codes. */
	ibanRaw: string;
	accountHolder: string;
	/** Canonical paypal.me URL without trailing slash. */
	paypalBaseUrl: string;
};

export const DEFAULT_GETRAENKEKASSE_PAYMENT = {
	iban: "DE65 5002 4024 3386 7890 30",
	accountHolder: "Noel Huibers",
	paypalBaseUrl: "https://paypal.me/CorpsRhenaniaBier",
} as const;

export async function getGetraenkekassePayment(): Promise<GetraenkekassePayment> {
	const [tenant, [konto]] = await Promise.all([
		getCurrentTenant(),
		db
			.select({ iban: kontos.iban, paypalLink: kontos.paypalLink })
			.from(kontos)
			.where(
				and(eq(kontos.kasseType, "Getränkekasse"), eq(kontos.isActive, true)),
			)
			.limit(1),
	]);

	// A mistyped konto IBAN must never reach members as a payment target.
	const kontoIban = konto?.iban && isValidIban(konto.iban) ? konto.iban : null;
	if (konto?.iban && !kontoIban) {
		console.warn(
			"Getränkekasse konto has an invalid IBAN — falling back to the default account.",
		);
	}
	const iban = kontoIban ?? DEFAULT_GETRAENKEKASSE_PAYMENT.iban;

	const rawPaypal =
		konto?.paypalLink ??
		tenant?.branding?.paypalUrl ??
		DEFAULT_GETRAENKEKASSE_PAYMENT.paypalBaseUrl;

	return {
		iban: formatIban(iban),
		ibanRaw: normalizeIban(iban),
		accountHolder: DEFAULT_GETRAENKEKASSE_PAYMENT.accountHolder,
		paypalBaseUrl: normalizePaypalLink(rawPaypal),
	};
}
