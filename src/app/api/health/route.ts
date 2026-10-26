// GET /api/health — public liveness check (uptime monitors, deploy smoke
// tests). No tenant data, no secrets.

import { NextResponse } from "next/server";

import { controlHealth, EXPECTED_HEADS } from "~/server/lib/health";

export const dynamic = "force-dynamic";

export async function GET() {
	const control = await controlHealth();
	return NextResponse.json(
		{
			ok: control.ok,
			sha: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
			control,
			expected: {
				tenant: EXPECTED_HEADS.tenant.tag,
				control: EXPECTED_HEADS.control.tag,
			},
		},
		{
			status: control.ok ? 200 : 503,
			headers: { "Cache-Control": "no-store" },
		},
	);
}
