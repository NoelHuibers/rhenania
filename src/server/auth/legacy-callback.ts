// legacy-callback.ts — the OAuth callback URL each Corps registered in its
// Entra app.
//
// Up to Better Auth 1.6 the generic OAuth plugin had its own callback
// endpoint, `/api/auth/oauth2/callback/<providerId>`, and that is the
// redirect URI every Corps' Entra app lists. Since 1.7 generic providers are
// ordinary social providers served by the core `/callback/<id>` endpoint.
// Rather than make every Corps change its Entra app, the provider keeps the
// old path (`callbackPath`, so the redirect URI Microsoft sees is unchanged)
// and the auth route hands requests on that path to the core endpoint.

import type { BetterAuthPlugin } from "better-auth";

const LEGACY_CALLBACK = "/oauth2/callback/";
const CORE_CALLBACK = "/callback/";

/** Serves this provider's OAuth callback on its pre-1.7 path. */
export function legacyCallbackPath(providerId: string): BetterAuthPlugin {
	return {
		id: "legacy-oauth2-callback",
		// Runs after genericOAuth, which put the provider into the context.
		init: (ctx) => ({
			context: {
				socialProviders: ctx.socialProviders.map((p) =>
					p.id === providerId
						? { ...p, callbackPath: `${LEGACY_CALLBACK}${p.id}` }
						: p,
				),
			},
		}),
	};
}

/**
 * The request with `<basePath>/oauth2/callback/<id>` rewritten to
 * `<basePath>/callback/<id>`; every other request unchanged.
 */
export async function toCoreCallback(
	request: Request,
	basePath = "/api/auth",
): Promise<Request> {
	const url = new URL(request.url);
	const prefix = `${basePath}${LEGACY_CALLBACK}`;
	if (!url.pathname.startsWith(prefix)) {
		return request;
	}
	url.pathname = `${basePath}${CORE_CALLBACK}${url.pathname.slice(prefix.length)}`;
	const hasBody = request.method !== "GET" && request.method !== "HEAD";
	return new Request(url, {
		method: request.method,
		headers: request.headers,
		body: hasBody ? await request.arrayBuffer() : undefined,
		redirect: request.redirect,
		signal: request.signal,
	});
}
