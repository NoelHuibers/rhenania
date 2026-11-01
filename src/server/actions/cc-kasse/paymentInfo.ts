"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { ibanSchema } from "~/lib/iban";
import { auth } from "~/server/auth";
import { userPaymentInfo } from "~/server/db/schema";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";

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
	if (!userId) {
		return null;
	}

	const { db } = await scopeOf(session.tenantId);
	const row = await db.query.userPaymentInfo.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
		columns: { accountHolder: true, iban: true },
	});
	return row ?? null;
}

export const setMyPaymentInfo = defineAction(
	{
		schema: z.tuple([paymentInfoSchema]),
		errorMessage: "Fehler beim Speichern",
	},
	async ([input], { tenant, user }) => {
		await tenant.db
			.insert(userPaymentInfo)
			.values({
				userId: user.id,
				accountHolder: input.accountHolder,
				iban: input.iban,
			})
			.onConflictDoUpdate({
				target: userPaymentInfo.userId,
				set: {
					accountHolder: input.accountHolder,
					iban: input.iban,
					updatedAt: sql`(unixepoch())`,
				},
			});
	},
);
