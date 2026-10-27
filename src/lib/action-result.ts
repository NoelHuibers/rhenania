// action-result.ts — what a server action answers (#59).
//
// Mutations return an ActionResult instead of throwing, so the client can
// show the error and the page keeps working. `error` is a German message
// for the user; `code` says what went wrong for code that needs to know
// (e.g. "UNAUTHENTICATED", "FORBIDDEN", "INVALID_INPUT").

export type ActionResult<T = void> =
	| { ok: true; data: T }
	| { ok: false; error: string; code?: string };

export function ok(): { ok: true; data: undefined };
export function ok<T>(data: T): { ok: true; data: T };
export function ok<T>(data?: T) {
	return { ok: true as const, data };
}

export function fail(
	error: string,
	code?: string,
): { ok: false; error: string; code?: string } {
	return code === undefined ? { ok: false, error } : { ok: false, error, code };
}
