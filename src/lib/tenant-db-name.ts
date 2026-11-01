// tenant-db-name.ts — the Turso database name of a new tenant (#224).
//
// Databases are named after the Corps' full name ("Corps Hassia Darmstadt"
// → corps-hassia-darmstadt), like the ones moved to Frankfurt on
// 2026-10-29. Shared by the new-tenant form (its suggestion) and the
// provisioning (its default), so both agree.

/** Turso's rule: lowercase letters, digits and dashes, 3–32 characters. */
const TURSO_DB_NAME = /^[a-z][a-z0-9-]{2,31}$/;
const MAX_LENGTH = 32;

export function isValidTursoDatabaseName(name: string): boolean {
	return TURSO_DB_NAME.test(name);
}

function wordsOf(text: string): string[] {
	return text
		.toLowerCase()
		.replace(/ä/g, "ae")
		.replace(/ö/g, "oe")
		.replace(/ü/g, "ue")
		.replace(/ß/g, "ss")
		.normalize("NFKD")
		.replace(/[̀-ͯ]/g, "")
		.split(/[^a-z0-9]+/)
		.filter(Boolean);
}

/**
 * `corps-<name>-<city>` from the display name. Names longer than Turso's 32
 * characters lose whole words from the end, so the city goes first. Falls
 * back to `corps-<slug>` when the display name yields nothing usable.
 */
export function tenantDatabaseName(displayName: string, slug: string): string {
	const words = wordsOf(displayName);
	if (words[0] !== "corps") {
		words.unshift("corps");
	}
	while (words.join("-").length > MAX_LENGTH && words.length > 2) {
		words.pop();
	}
	const name = words.join("-").slice(0, MAX_LENGTH).replace(/-+$/, "");
	if (name !== "corps" && isValidTursoDatabaseName(name)) {
		return name;
	}
	return `corps-${slug}`.toLowerCase().slice(0, MAX_LENGTH).replace(/-+$/, "");
}
