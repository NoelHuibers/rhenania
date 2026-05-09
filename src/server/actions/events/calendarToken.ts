"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { calendarTokens } from "~/server/db/schema";
import { getTenantDb } from "~/server/db/tenants";
import { requireTenantId } from "~/server/lib/tenant-context";

function generateToken() {
	return randomBytes(24).toString("base64url");
}

export async function getOrCreateCalendarToken() {
	const session = await auth();
	if (!session?.user?.id) return null;
	const userId = session.user.id;
	const tenantId = await requireTenantId();
	const tdb = await getTenantDb(tenantId);

	const [existing] = await tdb
		.select({ token: calendarTokens.token })
		.from(calendarTokens)
		.where(eq(calendarTokens.userId, userId))
		.limit(1);

	if (existing) return existing.token;

	const token = generateToken();
	await tdb.insert(calendarTokens).values({ userId, token });
	return token;
}

export async function rotateCalendarToken() {
	const session = await auth();
	if (!session?.user?.id) return null;
	const userId = session.user.id;
	const tenantId = await requireTenantId();
	const tdb = await getTenantDb(tenantId);

	await tdb.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
	const token = generateToken();
	await tdb.insert(calendarTokens).values({ userId, token });
	return token;
}
