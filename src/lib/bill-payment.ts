// bill-payment.ts — what a member needs to pay a Getränke bill: the
// reference text, the PayPal link with the amount filled in and the
// GiroCode (EPC QR) payload. Shared by the profile and the open-bill
// banner (#80), so every pay button sends the same amount and reference.

import { roundToCent } from "./money";

/** Verwendungszweck and PayPal note: "Max Muster - Rechnung 42". */
export function paymentReference(userName: string, billNumber: string): string {
	return `${userName} - Rechnung ${billNumber}`;
}

/** paypal.me link with the amount prefilled (PayPal wants `12.30EUR`). */
export function paypalAmountUrl(paypalBaseUrl: string, amount: number): string {
	const value = roundToCent(Number.isFinite(amount) ? amount : 0);
	return `${paypalBaseUrl.replace(/\/+$/, "")}/${value.toFixed(2)}EUR`;
}

/** EPC069-12 payload for a GiroCode a banking app can scan. */
export function girocodePayload(opts: {
	accountHolder: string;
	ibanRaw: string;
	amount: number;
	reference: string;
}): string {
	const value = roundToCent(Number.isFinite(opts.amount) ? opts.amount : 0);
	return [
		"BCD",
		"002",
		"1",
		"SCT",
		"",
		opts.accountHolder,
		opts.ibanRaw,
		`EUR${value.toFixed(2)}`,
		"",
		"",
		opts.reference,
	].join("\n");
}
