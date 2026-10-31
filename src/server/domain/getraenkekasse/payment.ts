// payment.ts — where members pay their drink bills, and who sends the bill.
//
// Pure: resolves the payment target and the bill's sender from the tenant's
// own data, which the Getränkekasse service reads. There is no built-in
// fallback, so a tenant that has not set up its Getränkekasse never sends
// members to somebody else's account.
//
//   - IBAN: the first active Getränkekasse `konto` with a valid IBAN.
//   - PayPal: that konto → tenant branding → none.
//   - Account holder and sender: `getraenke_billing_config` (edited by the
//     Getränkewart in Getränkewart › Kasse).

import { formatIban, isValidIban, normalizeIban } from "~/lib/iban";
import { normalizePaypalLink } from "~/lib/paypal";
import type { getraenkeBillingConfig } from "~/server/db/schema";

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
 * The payment target from the tenant's active Getränkekasse kontos (oldest
 * first), the configured account holder and the branding PayPal. Null when
 * there is no valid IBAN or no holder.
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
export function resolveGetraenkeBillSender(
	activeKontos: GetraenkekasseKontoRow[],
	profile: GetraenkeBillingProfile,
	brandingPaypal?: string | null,
): GetraenkeBillSenderResult {
	const payment = resolveGetraenkekassePayment(
		activeKontos,
		profile.accountHolder,
		brandingPaypal,
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
