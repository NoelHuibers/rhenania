// GET /api/cron/challenges — scheduled challenge sweep (called by .github/workflows/challenge-sweep.yml).
// Expires challenges past their reply/play window and auto-settles results
// nobody confirmed in time, in every active Corps plus the cross-Corps
// table. Page reads never do this; they only show overdue rows as expired.
//
// Authorised by `Authorization: Bearer $CRON_SECRET`, which Vercel Cron sends
// when the env var is set. Without CRON_SECRET the route refuses everything.
// Safe to run repeatedly or concurrently (Vercel may deliver a run twice).

import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { sweepAllChallenges } from "~/server/lib/challenge-sweep";
import { log } from "~/server/lib/log";

export const dynamic = "force-dynamic";

const sha256 = (value: string) => createHash("sha256").update(value).digest();

/** Constant-time, also in the length: both sides are hashed first. */
function authorised(header: string | null, secret: string | undefined) {
	if (!secret || header == null) {
		return false;
	}
	return timingSafeEqual(sha256(header), sha256(`Bearer ${secret}`));
}

export async function GET(request: Request) {
	if (!env.CRON_SECRET) {
		log.error("cron refused: CRON_SECRET is not set", {
			path: "/api/cron/challenges",
		});
	}
	if (!authorised(request.headers.get("authorization"), env.CRON_SECRET)) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const report = await sweepAllChallenges();
	if (!report.ok) {
		log.error("challenge sweep incomplete", { report });
	}
	return NextResponse.json(report, {
		status: report.ok ? 200 : 500,
		headers: { "Cache-Control": "no-store" },
	});
}
