// log.ts — structured server logging (#34).
//
// One JSON object per line, so Vercel's log search (and any log drain) can
// filter by field. During a request every line carries `tenant` (slug),
// `requestId` and, once an authz guard has run, `userId` (see
// log-context.ts); fields passed explicitly win.
//
//   } catch (error) {
//     await log.error("billing run failed", { err: error, periodId });
//   }
//
// Await the call: a serverless function may be frozen as soon as it
// returns, and the tenant lookup is asynchronous. Errors are written as
// `{ name, message, code, stack }`. Never pass secrets, tokens or personal
// data such as e-mail addresses; pass ids or kinds instead. As a safety
// net, e-mail addresses, bearer tokens, JWTs and `token=…`-style values are
// masked in every string, and fields named like a secret are dropped.

import type { RequestLogContext } from "./log-context";

export type LogLevel = "info" | "warn" | "error";
export type LogFields = Record<string, unknown>;

const REDACTIONS: Array<[RegExp, string]> = [
	[/[\w.%+-]+@[\w-]+(?:\.[\w-]+)*\.[A-Za-z]{2,}\b/g, "[email]"],
	[/\b(Bearer|Basic)\s+[\w.~+/=-]+/gi, "$1 [redacted]"],
	[/\beyJ[\w-]+\.[\w-]+\.[\w-]*/g, "[token]"],
	[/\bvercel_blob_rw_\w+/g, "[token]"],
	[
		/\b(password|passwd|secret|token|authToken|api[_-]?key|access[_-]?token|refresh[_-]?token)(["']?\s*[:=]\s*["']?)[^\s"'&,;]+/gi,
		"$1$2[redacted]",
	],
	// Query strings of URLs may carry tokens (signed links, libsql authToken).
	[/\b((?:https?|libsql|wss?):\/\/[^\s?#"']+)\?[^\s"')]*/gi, "$1?[redacted]"],
	[/\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]{4}){3,7}(?: ?[A-Z0-9]{1,4})?\b/g, "[iban]"],
];

/** Masks e-mail addresses, tokens, query strings and IBANs in free text. */
export function redact(text: string): string {
	let out = text;
	for (const [pattern, replacement] of REDACTIONS) {
		out = out.replace(pattern, replacement);
	}
	return out;
}

const SENSITIVE_KEY =
	/pass(?:word|wd)?$|secret|token|authorization|cookie|e-?mail|iban/i;
const MAX_MESSAGE = 500;
const MAX_FRAMES = 10;
const MAX_DEPTH = 4;

/** An error as log fields: class, masked message, code and stack frames. */
export function errorDetails(error: unknown): Record<string, unknown> {
	if (!(error instanceof Error)) {
		return {
			name: typeof error,
			message: redact(String(error)).slice(0, MAX_MESSAGE),
		};
	}
	const details: Record<string, unknown> = {
		name: error.name || "Error",
		message: redact(error.message).slice(0, MAX_MESSAGE),
	};
	const { code, digest } = error as { code?: unknown; digest?: unknown };
	if (typeof code === "string" || typeof code === "number") {
		details.code = code;
	}
	if (typeof digest === "string") {
		details.digest = digest;
	}
	const frames = (error.stack ?? "")
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.startsWith("at "))
		.slice(0, MAX_FRAMES)
		.map(redact);
	if (frames.length > 0) {
		details.stack = frames;
	}
	if (error.cause instanceof Error) {
		details.cause = {
			name: error.cause.name,
			message: redact(error.cause.message).slice(0, MAX_MESSAGE),
		};
	}
	return details;
}

function clean(value: unknown, depth: number): unknown {
	if (typeof value === "string") {
		return redact(value);
	}
	if (value instanceof Error) {
		return errorDetails(value);
	}
	if (value === null || typeof value !== "object" || value instanceof Date) {
		return value;
	}
	if (depth >= MAX_DEPTH) {
		return "[…]";
	}
	if (Array.isArray(value)) {
		return value.map((item) => clean(item, depth + 1));
	}
	const out: Record<string, unknown> = {};
	for (const [key, item] of Object.entries(value)) {
		out[key] = SENSITIVE_KEY.test(key) ? "[redacted]" : clean(item, depth + 1);
	}
	return out;
}

/**
 * Writes one line right away, without request context. For code that runs
 * outside a request (proxy, scripts) or that the context lookup itself
 * depends on (tenant config); everything else uses `log`.
 */
export function logLine(level: LogLevel, msg: string, fields?: LogFields) {
	const line = JSON.stringify({
		level,
		msg: redact(msg),
		...(clean(fields ?? {}, 0) as LogFields),
		time: new Date().toISOString(),
	});
	if (level === "error") {
		console.error(line);
	} else if (level === "warn") {
		console.warn(line);
	} else {
		// biome-ignore lint/suspicious/noConsole: the logger is the one place that writes info lines
		console.info(line);
	}
}

async function context(): Promise<RequestLogContext> {
	try {
		const { requestLogContext } = await import("./log-context");
		return await requestLogContext();
	} catch {
		return {};
	}
}

async function write(level: LogLevel, msg: string, fields?: LogFields) {
	logLine(level, msg, { ...(await context()), ...fields });
}

export const log = {
	info: (msg: string, fields?: LogFields) => write("info", msg, fields),
	warn: (msg: string, fields?: LogFields) => write("warn", msg, fields),
	error: (msg: string, fields?: LogFields) => write("error", msg, fields),
};
