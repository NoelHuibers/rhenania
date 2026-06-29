// IBAN helpers shared by the CC-Kasse reimbursement + profile payment flows.
// Loose structural validation only (no mod-97 checksum) — store exactly what
// the member submitted.

import { z } from "zod";

export function normalizeIban(raw: string): string {
	return raw.replace(/\s+/g, "").toUpperCase();
}

export function isValidIbanStructure(raw: string): boolean {
	const v = normalizeIban(raw);
	// 2 letters (country) + 2 digits (check) + 10–30 alphanumerics.
	return /^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v);
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
