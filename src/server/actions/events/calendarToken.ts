"use server";

import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { calendarTokens } from "~/server/db/schema";

function generateToken() {
	return randomBytes(24).toString("base64url");
}

export async function getOrCreateCalendarToken() {
	const session = await auth();
	if (!session?.user?.id) return null;
	const userId = session.user.id;

	const [existing] = await db
		.select({ token: calendarTokens.token })
		.from(calendarTokens)
		.where(eq(calendarTokens.userId, userId))
		.limit(1);

	if (existing) return existing.token;

	const token = generateToken();
	await db.insert(calendarTokens).values({ userId, token });
	return token;
}

export async function rotateCalendarToken() {
	const session = await auth();
	if (!session?.user?.id) return null;
	const userId = session.user.id;

	await db.delete(calendarTokens).where(eq(calendarTokens.userId, userId));
	const token = generateToken();
	await db.insert(calendarTokens).values({ userId, token });
	return token;
}
