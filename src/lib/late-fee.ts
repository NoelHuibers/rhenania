// late-fee.ts — the Mahnung on unpaid Getränke bills.
//
// One definition for what a billing run charges and what the bill letter
// promises, so the two cannot drift apart again (#11). Which rate is right
// is the owner's decision; this keeps the rate billing has always charged.

import { pctOf } from "~/lib/money";

export const LATE_FEE = {
	/** Percent of the carried-over amount. */
	percent: 10,
	/** Only carried-over amounts above this (in €) get a fee. */
	threshold: 5,
} as const;

/**
 * Fee on an amount carried over from earlier bills. Deferred (Gestundet)
 * bills never get one.
 */
export function lateFeeFor(carriedOver: number, wasDeferred: boolean): number {
	return !wasDeferred && carriedOver > LATE_FEE.threshold
		? pctOf(carriedOver, LATE_FEE.percent)
		: 0;
}

function formatNumber(value: number): string {
	return String(value).replace(".", ",");
}

/** The sentence part of the bill letter that states the fee rule. */
export function lateFeeSentence(): string {
	return `Bleiben mehr als ${formatNumber(LATE_FEE.threshold)}€ offen, gibt es eine Mahnung in Höhe von ${formatNumber(LATE_FEE.percent)}% davon auf die nächste`;
}
