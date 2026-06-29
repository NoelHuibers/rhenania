"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { fuchsenBillingConfig } from "~/server/db/schema";
import { hasRole } from "../admin/userRoles";

export type FuchsenBillingConfig = typeof fuchsenBillingConfig.$inferSelect;

const SINGLETON_ID = "singleton";

const EMPTY_CONFIG: FuchsenBillingConfig = {
	id: SINGLETON_ID,
	senderName: "",
	senderStreet: "",
	senderCity: "",
	location: "",
	iban: "",
	accountHolder: "",
	paypalBaseUrl: "",
	paymentDueDays: 14,
	updatedAt: null,
	updatedBy: null,
};

const configSchema = z.object({
	senderName: z.string().max(255),
	senderStreet: z.string().max(255),
	senderCity: z.string().max(255),
	location: z.string().max(255),
	iban: z.string().max(50),
	accountHolder: z.string().max(255),
	paypalBaseUrl: z
		.string()
		.max(500)
		.refine((v) => v === "" || /^https?:\/\//.test(v), {
			message: "PayPal-Link muss mit http(s):// beginnen",
		}),
	paymentDueDays: z.number().int().min(1).max(90),
});

export type FuchsenBillingConfigInput = z.infer<typeof configSchema>;

/** Readable by any authenticated user (members need the payment details). */
export async function getFuchsenBillingConfig(): Promise<FuchsenBillingConfig> {
	try {
		const [config] = await db
			.select()
			.from(fuchsenBillingConfig)
			.where(eq(fuchsenBillingConfig.id, SINGLETON_ID))
			.limit(1);
		return config ?? EMPTY_CONFIG;
	} catch (error) {
		console.error("Error loading fuchsen billing config:", error);
		return EMPTY_CONFIG;
	}
}

export async function updateFuchsenBillingConfig(
	input: FuchsenBillingConfigInput,
) {
	const session = await auth();
	if (!session?.user?.id) {
		return { success: false, error: "Authentifizierung erforderlich" };
	}
	const [isFuchs, isAdmin] = await Promise.all([
		hasRole(session.user.id, "Fuchs"),
		hasRole(session.user.id, "Admin"),
	]);
	if (!isFuchs && !isAdmin) {
		return { success: false, error: "Keine Berechtigung" };
	}

	const parsed = configSchema.safeParse(input);
	if (!parsed.success) {
		return {
			success: false,
			error: parsed.error.issues[0]?.message ?? "Validierungsfehler",
		};
	}

	try {
		const now = new Date();
		await db
			.insert(fuchsenBillingConfig)
			.values({
				id: SINGLETON_ID,
				...parsed.data,
				updatedAt: now,
				updatedBy: session.user.id,
			})
			.onConflictDoUpdate({
				target: fuchsenBillingConfig.id,
				set: {
					...parsed.data,
					updatedAt: now,
					updatedBy: session.user.id,
				},
			});
		return { success: true, message: "Zahlungsdaten gespeichert" };
	} catch (error) {
		console.error("Error updating fuchsen billing config:", error);
		return { success: false, error: "Fehler beim Speichern" };
	}
}
