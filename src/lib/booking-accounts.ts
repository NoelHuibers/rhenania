// booking-accounts.ts — the group accounts a drink can be booked on
// ("Auf ein Konto buchen"). The Getränkewart manages them in the Kasse; the
// menu shows the pinned ones as chips and the rest behind "Weitere".
//
// Pure, so the rules can be tested without a database.

/** What the menu needs to know about an account. */
export type BookingAccountOption = { name: string; pinned: boolean };

export const MAX_ACCOUNT_NAME_LENGTH = 40;

/** Trimmed, inner whitespace collapsed to one space. */
export function normalizeAccountName(raw: string): string {
	return raw.trim().replace(/\s+/g, " ");
}

/**
 * Two names billing would put on the same group bill: it keys group bills
 * by the lowercased name with dashes for spaces, so "CC Besuch" and
 * "cc-besuch" would collide.
 */
export function accountKey(name: string): string {
	return normalizeAccountName(name)
		.toLowerCase()
		.replace(/[\s-]+/g, "-");
}

/**
 * Why `name` (already normalized) can't be a new account, or null if it
 * can. `existing` are the names of all accounts, archived ones included.
 */
export function accountNameProblem(
	name: string,
	existing: readonly string[],
): string | null {
	if (name === "") {
		return "Bitte einen Namen eingeben.";
	}
	if (name.length > MAX_ACCOUNT_NAME_LENGTH) {
		return `Der Name darf höchstens ${MAX_ACCOUNT_NAME_LENGTH} Zeichen lang sein.`;
	}
	if (name.toLowerCase() === "privat") {
		return "„Privat“ ist die Buchung auf eigene Kosten.";
	}
	const key = accountKey(name);
	const clash = existing.find((other) => accountKey(other) === key);
	if (clash !== undefined) {
		return `Das Konto „${clash}“ gibt es schon.`;
	}
	return null;
}

/**
 * The chips and the "Weitere" list of the selector. A non-pinned account
 * that is selected joins the chips, so the choice stays visible.
 */
export function splitBookingAccounts(
	accounts: readonly BookingAccountOption[],
	selected: string | null,
): { chips: string[]; more: string[] } {
	const chips: string[] = [];
	const more: string[] = [];
	for (const { name, pinned } of accounts) {
		(pinned ? chips : more).push(name);
	}
	if (selected !== null && more.includes(selected)) {
		chips.push(selected);
	}
	return { chips, more };
}
