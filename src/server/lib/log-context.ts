// log-context.ts — who and where a server log line belongs to (#34).
//
// `log` (src/server/lib/log.ts) adds these fields to every line written
// during a request:
// - `tenant`: slug of the request's Corps, from the host like
//   `getTenantId()` (both lookups are cached per instance),
// - `requestId`: Vercel's `x-vercel-id` (or an `x-request-id`), which also
//   appears in the Vercel request log,
// - `userId`: the caller, once an authz guard has checked them.
//
// Outside a request (scripts, build, the proxy) there is no context and the
// line is written without these fields. Nothing here ever throws.

import { headers } from "next/headers";

import { getTenantById, resolveTenantByHost } from "./tenant-context";

export type RequestLogContext = {
	tenant?: string;
	requestId?: string;
	userId?: string;
};

/** How long the tenant lookup may take before the line is written without. */
export const LOG_CONTEXT_TIMEOUT_MS = 1_000;

// Next hands out one headers object per request, so it keys the caller.
// A WeakMap rather than React `cache`, which does not memoize in server
// actions or route handlers.
const usersByRequest = new WeakMap<object, string>();

type HeaderReader = { get(name: string): string | null | undefined };

async function requestHeaders(): Promise<HeaderReader | null> {
	try {
		return await headers();
	} catch {
		// Not inside a request.
		return null;
	}
}

/** Remembers the checked caller of the current request for log lines. */
export async function noteRequestUser(userId: string): Promise<void> {
	const h = await requestHeaders();
	if (h) {
		usersByRequest.set(h, userId);
	}
}

const REQUEST_ID = /^[\w.:-]{1,128}$/;

/** Vercel's request id, or a forwarded `x-request-id`; ignored if odd-looking. */
export function requestIdFrom(h: HeaderReader): string | undefined {
	const id = h.get("x-vercel-id") ?? h.get("x-request-id");
	return id && REQUEST_ID.test(id) ? id : undefined;
}

async function tenantSlug(h: HeaderReader): Promise<string | undefined> {
	const id = await resolveTenantByHost(
		h.get("x-forwarded-host") ?? h.get("host"),
	);
	return id ? (await getTenantById(id))?.slug : undefined;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), ms);
	});
	return Promise.race([promise.catch(() => null), timeout]).finally(() =>
		clearTimeout(timer),
	);
}

/** Context of the current request; empty outside one. Never throws. */
export async function requestLogContext(
	timeoutMs = LOG_CONTEXT_TIMEOUT_MS,
): Promise<RequestLogContext> {
	const h = await requestHeaders();
	if (!h) {
		return {};
	}
	const context: RequestLogContext = {};
	const tenant = await withTimeout(tenantSlug(h), timeoutMs);
	if (tenant) {
		context.tenant = tenant;
	}
	const requestId = requestIdFrom(h);
	if (requestId) {
		context.requestId = requestId;
	}
	const userId = usersByRequest.get(h);
	if (userId) {
		context.userId = userId;
	}
	return context;
}
