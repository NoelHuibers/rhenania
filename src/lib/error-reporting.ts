// error-reporting.ts — where unexpected errors leave the app.
//
// Two sources report here:
// - server request errors, via `onRequestError` in src/instrumentation.ts
//   (src/server/lib/request-error-log.ts), and
// - the error boundaries (error.tsx / global-error.tsx) in the browser, via
//   `reportBoundaryError` below.
//
// Both write one JSON line in the shape of src/server/lib/log.ts and then
// call `captureError` in src/lib/error-tracker.ts, the one hook for an error
// tracker. It does nothing yet; nothing is sent to a vendor.
//
// Only the error's name and digest are recorded, never its message or
// stack: messages can carry personal data (emails, names in SQL values).
// The digest is shown to the member on the error screen and is also printed
// by Next next to the full server-side stack, so support can match the two.

import { captureError } from "./error-tracker";

/** Where an error was caught. */
export type ErrorSource = "request" | "boundary" | "global-boundary";

export type ErrorFields = {
	source: ErrorSource;
	/** Tenant slug, when it could be resolved. */
	tenant?: string | null;
	/** Route file or path, never with a query string (it may hold tokens). */
	route?: string;
	digest?: string;
	[key: string]: unknown;
};

/** Next's digest of a server error (`error.digest`), if there is one. */
export function errorDigest(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "digest" in error) {
		const digest = (error as { digest: unknown }).digest;
		if (typeof digest === "string" && digest.length > 0) {
			return digest;
		}
		if (typeof digest === "number") {
			return String(digest);
		}
	}
	return undefined;
}

/** The error's class name (`TypeError`, `LibsqlError`), never its message. */
export function errorName(error: unknown): string {
	if (error instanceof Error) {
		return error.name || "Error";
	}
	return typeof error;
}

/** Drops the query string and hash, which may carry tokens. */
export function stripQuery(path: string): string {
	return path.split(/[?#]/, 1)[0] ?? "";
}

/** Writes one JSON line and hands the error to the tracker hook. */
export function reportError(
	msg: string,
	error: unknown,
	fields: ErrorFields,
): void {
	const line = {
		level: "error",
		msg,
		...fields,
		digest: fields.digest ?? errorDigest(error),
		error: errorName(error),
		time: new Date().toISOString(),
	};
	console.error(JSON.stringify(line));
	try {
		captureError(error, line);
	} catch {
		// A broken tracker must not take the error screen down with it.
	}
}

/** Called by the error boundaries once per caught error. */
export function reportBoundaryError(
	error: unknown,
	fields: {
		boundary: string;
		tenant?: string | null;
		path?: string;
		global?: boolean;
	},
): void {
	const { global, path, ...rest } = fields;
	reportError("error boundary", error, {
		source: global ? "global-boundary" : "boundary",
		...rest,
		route: path === undefined ? undefined : stripQuery(path),
	});
}
