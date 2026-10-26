// IBAN helpers shared by the CC-Kasse reimbursement + profile payment flows.
// Member-submitted IBANs get loose structural validation only (no mod-97
// checksum) — store exactly what the member submitted. Corps bank accounts
// (`kontos`) are shown to every member as a payment target, so those use the
// strict `isValidIban` check instead.

import { z } from "zod";

export function normalizeIban(raw: string): string {
	return raw.replace(/\s+/g, "").toUpperCase();
}

export function isValidIbanStructure(raw: string): boolean {
	const v = normalizeIban(raw);
	// 2 letters (country) + 2 digits (check) + 10–30 alphanumerics.
	return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v);
}

// Fixed IBAN lengths for the countries a Corps account realistically uses.
// Countries not listed here are only checked against the mod-97 checksum.
const IBAN_LENGTHS: Record<string, number> = {
	AT: 20,
	BE: 16,
	CH: 21,
	DE: 22,
	DK: 18,
	ES: 24,
	FR: 27,
	GB: 22,
	IT: 27,
	LI: 21,
	LU: 20,
	NL: 18,
	PL: 28,
};

/**
 * Strict IBAN check: structure, country-specific length and the ISO 13616
 * mod-97 checksum. Catches truncated or mistyped account numbers.
 */
export function isValidIban(raw: string): boolean {
	const v = normalizeIban(raw);
	if (!isValidIbanStructure(v)) {
		return false;
	}

	const expectedLength = IBAN_LENGTHS[v.slice(0, 2)];
	if (expectedLength !== undefined && v.length !== expectedLength) {
		return false;
	}

	// Move the country code + check digits to the end, map letters to numbers
	// (A=10 … Z=35) and reduce digit by digit to stay within safe integers.
	const rearranged = v.slice(4) + v.slice(0, 4);
	let remainder = 0;
	for (const char of rearranged) {
		const digits = /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
		for (const digit of digits) {
			remainder = (remainder * 10 + Number(digit)) % 97;
		}
	}
	return remainder === 1;
}

/** Group into blocks of four for display, e.g. "DE12 3456 7890 …". */
export function formatIban(raw: string): string {
	return normalizeIban(raw)
		.replace(/(.{4})/g, "$1 ")
		.trim();
}

/** Shared zod schema: normalizes then structurally validates an IBAN. */
export const ibanSchema = z
	.string()
	.min(1, "IBAN ist erforderlich")
	.transform(normalizeIban)
	.refine(isValidIbanStructure, "Ungültige IBAN");
