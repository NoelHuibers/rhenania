// db-errors.ts — recognise database errors that callers want to explain.

const SQLITE_CONSTRAINT_FOREIGNKEY = 787;

type ErrorLike = {
	code?: unknown;
	rawCode?: unknown;
	message?: unknown;
	cause?: unknown;
};

/**
 * True when `error` (or any error in its `cause` chain) is a SQLite foreign
 * key violation, e.g. deleting a row that other rows still reference.
 * Drizzle wraps the libSQL error in a "Failed query" error, and remote libSQL
 * reports only the primary code, so the extended code, the raw code and the
 * message are all checked.
 */
export function isForeignKeyViolation(error: unknown): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 10 && current; depth++) {
		if (typeof current !== "object") {
			return false;
		}
		const e = current as ErrorLike;
		if (
			e.code === "SQLITE_CONSTRAINT_FOREIGNKEY" ||
			e.rawCode === SQLITE_CONSTRAINT_FOREIGNKEY ||
			(typeof e.message === "string" &&
				e.message.includes("FOREIGN KEY constraint failed"))
		) {
			return true;
		}
		current = e.cause;
	}
	return false;
}
