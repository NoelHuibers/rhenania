// GET /api/health/tenants — per-tenant health and schema drift.
// Authorised by `Authorization: Bearer $HEALTH_TOKEN` (scheduled checks) or a
// superadmin session. Returns 503 if any tenant is unreachable or drifted.

import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";

import { env } from "~/env";
import { getIdentity } from "~/server/auth";
import { EXPECTED_HEADS, tenantsHealth } from "~/server/lib/health";
import { log } from "~/server/lib/log";
import { isSuperAdmin } from "~/server/lib/super-admin";

export const dynamic = "force-dynamic";

function bearerMatches(header: string | null, token: string | undefined) {
	if (!token || !header?.startsWith("Bearer ")) {
		return false;
	}
	const given = Buffer.from(header.slice("Bearer ".length));
	const expected = Buffer.from(token);
	return given.length === expected.length && timingSafeEqual(given, expected);
}

async function authorised(request: Request) {
	if (bearerMatches(request.headers.get("authorization"), env.HEALTH_TOKEN)) {
		return true;
	}
	// Superadmins need not be members of the Corps whose host they use.
	const identity = await getIdentity();
	return identity ? isSuperAdmin(identity.user.id) : false;
}

export async function GET(request: Request) {
	if (!(await authorised(request))) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}
	const results = await tenantsHealth();
	const healthy = results.every((r) => r.ok && !r.drift);
	// One line per unhealthy tenant, so the daily check (and log alerts)
	// can filter by `tenant`.
	for (const r of results) {
		if (!r.ok || r.drift || (r.mirrorDrift ?? 0) > 0) {
			await log.warn("tenant unhealthy", {
				tenant: r.slug,
				status: r.status,
				reachable: r.ok,
				schemaBehind: r.drift,
				head: r.head,
				mirrorDrift: r.mirrorDrift,
				reason: r.error,
			});
		}
	}
	return NextResponse.json(
		{ healthy, expected: EXPECTED_HEADS.tenant.tag, tenants: results },
		{ status: healthy ? 200 : 503, headers: { "Cache-Control": "no-store" } },
	);
}
