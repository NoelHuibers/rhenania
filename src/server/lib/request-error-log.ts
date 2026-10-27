// request-error-log.ts — one JSON log line per server error, with the tenant.
//
// Called by `onRequestError` in src/instrumentation.ts for every error Next
// catches while rendering, in a route handler, a server action or the proxy.
// The line carries the tenant slug, the route and Next's digest (the same
// code the member sees on the error screen); Next prints the full stack
// next to it. See src/lib/error-reporting.ts for the tracker hook.

import type { Instrumentation } from "next";

import { reportError, stripQuery } from "~/lib/error-reporting";
import {
	getTenantById,
	resolveTenantByHost,
	TENANT_HEADER,
} from "~/server/lib/tenant-context";

type RequestInfo = Parameters<Instrumentation.onRequestError>[1];
type RequestContext = Parameters<Instrumentation.onRequestError>[2];

/** How long the tenant lookup may take before the line is written without. */
export const TENANT_LOOKUP_TIMEOUT_MS = 1_000;

function header(info: RequestInfo, name: string): string | undefined {
	const value = info.headers[name];
	return Array.isArray(value) ? value[0] : value;
}

async function lookupSlug(info: RequestInfo): Promise<string | null> {
	// The proxy stamps the tenant id on the request; errors thrown in the
	// proxy itself (or before it ran) only have the host.
	const id =
		header(info, TENANT_HEADER) ??
		(await resolveTenantByHost(
			header(info, "x-forwarded-host") ?? header(info, "host"),
		));
	if (!id) {
		return null;
	}
	return (await getTenantById(id))?.slug ?? null;
}

/**
 * Tenant slug of the failed request, or null if it cannot be resolved in
 * time. Never throws: the error may well be that the control DB is down.
 */
export async function tenantSlugForRequest(
	info: RequestInfo,
	timeoutMs = TENANT_LOOKUP_TIMEOUT_MS,
): Promise<string | null> {
	let timer: ReturnType<typeof setTimeout> | undefined;
	const timeout = new Promise<null>((resolve) => {
		timer = setTimeout(() => resolve(null), timeoutMs);
	});
	try {
		return await Promise.race([lookupSlug(info).catch(() => null), timeout]);
	} finally {
		clearTimeout(timer);
	}
}

export async function logRequestError(
	error: unknown,
	info: RequestInfo,
	context: RequestContext,
): Promise<void> {
	reportError("request error", error, {
		source: "request",
		tenant: await tenantSlugForRequest(info),
		route: context.routePath,
		path: stripQuery(info.path),
		method: info.method,
		routeType: context.routeType,
	});
}
