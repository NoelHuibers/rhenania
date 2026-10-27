// instrumentation.ts — Next's server observability entry point.
//
// `onRequestError` runs for every error Next catches on the server and
// writes one JSON line with tenant, route and digest. To add an error
// tracker, see the ERROR TRACKER HOOK in src/lib/error-reporting.ts (and
// initialise its SDK in a `register` export here).

import type { Instrumentation } from "next";

export const onRequestError: Instrumentation.onRequestError = async (
	error,
	request,
	context,
) => {
	// The tenant lookup needs the Node.js database client. The app has no
	// Edge routes today; Next still prints those errors itself.
	if (process.env.NEXT_RUNTIME === "edge") {
		return;
	}
	try {
		const { logRequestError } = await import("~/server/lib/request-error-log");
		await logRequestError(error, request, context);
	} catch (e) {
		// Logging must never turn one error into two.
		console.error("onRequestError failed", e);
	}
};
