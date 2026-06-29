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

// Members may edit all of their own data EXCEPT their status (Abteilung) and the
// management-only "Adresse veraltet" flag.
const selfSchema = z.object({
	firstName: z.string().trim().min(1, "Vorname erforderlich").max(255),
	lastName: z.string().trim().min(1, "Nachname erforderlich").max(255),
	title: z.string().max(255).nullable().optional(),
	email: z.string().max(255).nullable().optional(),
	email2: z.string().max(255).nullable().optional(),
	email3: z.string().max(255).nullable().optional(),
	mobile: z.string().max(100).nullable().optional(),
	phonePrivate: z.string().max(100).nullable().optional(),
	phonePrivate2: z.string().max(100).nullable().optional(),
	phoneWork: z.string().max(100).nullable().optional(),
	phoneWork2: z.string().max(100).nullable().optional(),
	company: z.string().max(255).nullable().optional(),
	birthday: z.string().max(50).nullable().optional(),
	street: z.string().max(255).nullable().optional(),
	houseNumber: z.string().max(50).nullable().optional(),
	addressLine2: z.string().max(255).nullable().optional(),
	postalCode: z.string().max(20).nullable().optional(),
	city: z.string().max(255).nullable().optional(),
	country: z.string().max(100).nullable().optional(),
	forwarding: z.boolean().optional(),
	lettersOptOut: z.boolean().optional(),
	notes: z.string().max(1000).nullable().optional(),
});

export async function updateMyMember(input: z.input<typeof selfSchema>) {
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
		const p = selfSchema.parse(input);
		await db
			.update(members)
			.set({
				firstName: p.firstName.trim(),
				lastName: p.lastName.trim(),
				title: clean(p.title),
				email: clean(p.email),
				email2: clean(p.email2),
				email3: clean(p.email3),
				mobile: clean(p.mobile),
				phonePrivate: clean(p.phonePrivate),
				phonePrivate2: clean(p.phonePrivate2),
				phoneWork: clean(p.phoneWork),
				phoneWork2: clean(p.phoneWork2),
				company: clean(p.company),
				birthday: clean(p.birthday),
				street: clean(p.street),
				houseNumber: clean(p.houseNumber),
				addressLine2: clean(p.addressLine2),
				postalCode: clean(p.postalCode),
				city: clean(p.city),
				country: clean(p.country) ?? "Deutschland",
				forwarding: p.forwarding ?? member.forwarding,
				lettersOptOut: p.lettersOptOut ?? member.lettersOptOut,
				notes: clean(p.notes),
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
		console.error("Error updating own member data:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}
