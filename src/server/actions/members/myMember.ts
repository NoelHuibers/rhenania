"use server";

import { and, eq, isNull, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { type Member, members } from "~/server/db/schema";

const clean = (s?: string | null): string | null => {
	const t = s?.trim();
	return t ? t : null;
};

// Resolve the member row for the current account: by userId, else auto-link the
// single unlinked member whose email matches (case-insensitive). Returns null
// if there is no match or an ambiguous (>1) match.
async function resolveMyMember(
	userId: string,
	email: string | null,
): Promise<Member | null> {
	const byUser = await db.query.members.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
	});
	if (byUser) return byUser;
	if (!email) return null;

	const matches = await db
		.select()
		.from(members)
		.where(
			and(
				isNull(members.userId),
				sql`lower(${members.email}) = lower(${email})`,
			),
		);
	if (matches.length !== 1) return null;

	const m = matches[0];
	if (!m) return null;
	// Race-guarded link.
	await db
		.update(members)
		.set({ userId })
		.where(and(eq(members.id, m.id), isNull(members.userId)));
	return { ...m, userId };
}

export async function getMyMember(): Promise<Member | null> {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return null;
	return resolveMyMember(userId, session.user.email ?? null);
}

const addressSchema = z.object({
	email: z.string().max(255).nullable().optional(),
	street: z.string().max(255).nullable().optional(),
	houseNumber: z.string().max(50).nullable().optional(),
	addressLine2: z.string().max(255).nullable().optional(),
	postalCode: z.string().max(20).nullable().optional(),
	city: z.string().max(255).nullable().optional(),
	country: z.string().max(100).nullable().optional(),
	lettersOptOut: z.boolean().optional(),
});

export async function updateMyAddress(input: z.input<typeof addressSchema>) {
	const session = await auth();
	const userId = session?.user?.id;
	if (!userId) return { success: false as const, error: "Nicht angemeldet" };

	const member = await resolveMyMember(userId, session.user.email ?? null);
	if (!member) {
		return {
			success: false as const,
			error: "Kein Mitgliedseintrag gefunden — wende dich an den Senior.",
		};
	}

	try {
		const parsed = addressSchema.parse(input);
		await db
			.update(members)
			.set({
				email: clean(parsed.email),
				street: clean(parsed.street),
				houseNumber: clean(parsed.houseNumber),
				addressLine2: clean(parsed.addressLine2),
				postalCode: clean(parsed.postalCode),
				city: clean(parsed.city),
				country: clean(parsed.country) ?? "Deutschland",
				lettersOptOut: parsed.lettersOptOut ?? member.lettersOptOut,
				updatedBy: userId,
			})
			.where(eq(members.id, member.id));
		revalidatePath("/profile");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating own address:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}
