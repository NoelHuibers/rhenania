// db-errors.ts — recognise database errors that callers want to explain.

const SQLITE_CONSTRAINT_FOREIGNKEY = 787;
const SQLITE_CONSTRAINT_UNIQUE = 2067;

type ErrorLike = {
	code?: unknown;
	rawCode?: unknown;
	message?: unknown;
	cause?: unknown;
};

/**
 * True when `error` or any error in its `cause` chain is the SQLite
 * constraint failure described by `code`, `rawCode` and `message`. Drizzle
 * wraps the libSQL error in a "Failed query" error, and remote libSQL
 * reports only the primary code, so the extended code, the raw code and the
 * message are all checked.
 */
function isConstraintViolation(
	error: unknown,
	match: { code: string; rawCode: number; message: string },
): boolean {
	let current: unknown = error;
	for (let depth = 0; depth < 10 && current; depth++) {
		if (typeof current !== "object") {
			return false;
		}
		const e = current as ErrorLike;
		if (
			e.code === match.code ||
			e.rawCode === match.rawCode ||
			(typeof e.message === "string" && e.message.includes(match.message))
		) {
			return true;
		}
		current = e.cause;
	}
	return false;
}

/**
 * True when `error` is a SQLite foreign key violation, e.g. deleting a row
 * that other rows still reference.
 */
export function isForeignKeyViolation(error: unknown): boolean {
	return isConstraintViolation(error, {
		code: "SQLITE_CONSTRAINT_FOREIGNKEY",
		rawCode: SQLITE_CONSTRAINT_FOREIGNKEY,
		message: "FOREIGN KEY constraint failed",
	});
}

/**
 * True when `error` is a SQLite UNIQUE violation, e.g. a name that another
 * row already has.
 */
export function isUniqueViolation(error: unknown): boolean {
	return isConstraintViolation(error, {
		code: "SQLITE_CONSTRAINT_UNIQUE",
		rawCode: SQLITE_CONSTRAINT_UNIQUE,
		message: "UNIQUE constraint failed",
	});
}
