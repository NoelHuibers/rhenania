"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { ibanSchema } from "~/lib/iban";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { userPaymentInfo } from "~/server/db/schema";

const paymentInfoSchema = z.object({
	accountHolder: z
		.string()
		.min(1, "Kontoinhaber ist erforderlich")
		.max(255, "Kontoinhaber ist zu lang"),
	iban: ibanSchema,
});

export type MyPaymentInfo = { accountHolder: string; iban: string };

export async function getMyPaymentInfo(): Promise<MyPaymentInfo | null> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return null;

	const row = await db.query.userPaymentInfo.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
		columns: { accountHolder: true, iban: true },
	});
	return row ?? null;
}

export async function setMyPaymentInfo(input: {
	accountHolder: string;
	iban: string;
}): Promise<{ success: true } | { success: false; error: string }> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return { success: false, error: "Nicht angemeldet" };

	try {
		const parsed = paymentInfoSchema.parse(input);

		await db
			.insert(userPaymentInfo)
			.values({
				userId,
				accountHolder: parsed.accountHolder,
				iban: parsed.iban,
			})
			.onConflictDoUpdate({
				target: userPaymentInfo.userId,
				set: {
					accountHolder: parsed.accountHolder,
					iban: parsed.iban,
					updatedAt: sql`(unixepoch())`,
				},
			});

		return { success: true };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error saving payment info:", error);
		return { success: false, error: "Fehler beim Speichern" };
	}
}
