"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { calendarTokens } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { defineAction } from "~/server/lib/define-action";
import { requireTenantId } from "~/server/lib/tenant-context";

function generateToken() {
	return randomBytes(24).toString("base64url");
}

export async function getOrCreateCalendarToken() {
	const session = await auth();
	if (!session?.user?.id) {
		return null;
	}
	const userId = session.user.id;
	const tenantId = await requireTenantId();
	const tdb = await getTenantDb(tenantId);

	const [existing] = await tdb
		.select({ token: calendarTokens.token })
		.from(calendarTokens)
		.where(eq(calendarTokens.userId, userId))
		.limit(1);

	if (existing) {
		return existing.token;
	}

	const token = generateToken();
	await tdb.insert(calendarTokens).values({ userId, token });
	return token;
}

/** Replaces the caller's feed token; old subscription links stop working. */
export const rotateCalendarToken = defineAction(
	{ errorMessage: "Der Kalender-Link konnte nicht erneuert werden" },
	async ({ tenant, user }) => {
		await tenant.db
			.delete(calendarTokens)
			.where(eq(calendarTokens.userId, user.id));
		const token = generateToken();
		await tenant.db.insert(calendarTokens).values({ userId: user.id, token });
		return token;
	},
);
