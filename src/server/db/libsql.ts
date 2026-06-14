// libsql.ts — shared libSQL client factory.
//
// Next.js patches the global `fetch`. On Node >= 24.14, that patched fetch
// throws "expected non-null body source" when a caller passes a `Request`
// object *and* the server returns an error response (vercel/next.js#90826):
// the patch tries to re-read the already-consumed Request body. @libsql/client's
// HTTP transport passes a `Request` object, so a transient Turso error response
// surfaces as a hard, mislabeled "fetch failed" query error instead of being
// retried/handled normally.
//
// Workaround: hand the client a custom `fetch` that deconstructs the Request
// into (url, init) before calling the global fetch. The Next bug only triggers
// for Request *objects*, and the body is materialized into an ArrayBuffer
// (re-readable), so this sidesteps it while preserving timeouts/abort via the
// forwarded signal. `libsql://` URLs resolve to this HTTP transport, so the
// override applies to every remote client.

import {
	type Client,
	type Config,
	createClient as createLibsqlClient,
} from "@libsql/client";

async function deconstructedFetch(request: Request): Promise<Response> {
	const init: RequestInit & { duplex?: "half" } = {
		method: request.method,
		headers: request.headers,
		signal: request.signal,
		redirect: request.redirect,
	};
	if (request.method !== "GET" && request.method !== "HEAD") {
		init.body = await request.arrayBuffer();
	}
	return fetch(request.url, init);
}

export function createClient(config: Config): Client {
	return createLibsqlClient({
		...config,
		fetch: deconstructedFetch as Config["fetch"],
	});
}
