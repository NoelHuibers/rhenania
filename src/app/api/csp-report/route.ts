// POST /api/csp-report — Content-Security-Policy violation reports (#91).
//
// The CSP in next.config.js runs in report-only mode and names this route in
// `report-uri` and `report-to`. Each violation becomes one "csp violation"
// warn line in the logs, so the policy can be enforced once they stay quiet.
// Public (browsers send reports without a session); bodies are capped and at
// most MAX_REPORTS (csp-report.ts) lines are written per request.

import { parseCspReports } from "~/server/lib/csp-report";
import { log } from "~/server/lib/log";

const MAX_BYTES = 64 * 1024;

/** The body as text, or null once it exceeds `limit` bytes. */
async function readCapped(request: Request, limit: number) {
	if (Number(request.headers.get("content-length") ?? 0) > limit) {
		return null;
	}
	if (!request.body) {
		return "";
	}
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		size += value.byteLength;
		if (size > limit) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	return new TextDecoder().decode(Buffer.concat(chunks));
}

export async function POST(request: Request) {
	const raw = await readCapped(request, MAX_BYTES);
	if (raw === null) {
		return new Response(null, { status: 413 });
	}
	for (const violation of parseCspReports(raw)) {
		await log.warn("csp violation", violation);
	}
	return new Response(null, { status: 204 });
}
