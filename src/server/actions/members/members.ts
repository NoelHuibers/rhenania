"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { members, semesterbeitragCharges } from "~/server/db/schema";
import {
	isBeitragspflichtig,
	MEMBER_EDIT_ROLES,
	MEMBER_STATUSES,
	MEMBER_VIEW_ROLES,
	requireRoles,
} from "./_guards";

const clean = (s?: string | null): string | null => {
	const t = s?.trim();
	return t ? t : null;
};

const memberInputSchema = z.object({
	status: z.enum(MEMBER_STATUSES),
	firstName: z.string().trim().min(1, "Vorname erforderlich").max(255),
	lastName: z.string().trim().min(1, "Nachname erforderlich").max(255),
	email: z.string().max(255).nullable().optional(),
	street: z.string().max(255).nullable().optional(),
	houseNumber: z.string().max(50).nullable().optional(),
	addressLine2: z.string().max(255).nullable().optional(),
	postalCode: z.string().max(20).nullable().optional(),
	city: z.string().max(255).nullable().optional(),
	country: z.string().max(100).nullable().optional(),
	lettersOptOut: z.boolean().optional(),
	addressNeedsUpdate: z.boolean().optional(),
	notes: z.string().max(1000).nullable().optional(),
});

type MemberInput = z.input<typeof memberInputSchema>;

function toValues(parsed: z.infer<typeof memberInputSchema>) {
	return {
		status: parsed.status,
		firstName: parsed.firstName.trim(),
		lastName: parsed.lastName.trim(),
		email: clean(parsed.email),
		street: clean(parsed.street),
		houseNumber: clean(parsed.houseNumber),
		addressLine2: clean(parsed.addressLine2),
		postalCode: clean(parsed.postalCode),
		city: clean(parsed.city),
		country: clean(parsed.country) ?? "Deutschland",
		lettersOptOut: parsed.lettersOptOut ?? false,
		addressNeedsUpdate: parsed.addressNeedsUpdate ?? false,
		notes: clean(parsed.notes),
	};
}

export async function listMembers() {
	const guard = await requireRoles(MEMBER_VIEW_ROLES);
	if (!guard.ok) return [];
	const rows = await db
		.select()
		.from(members)
		.orderBy(asc(members.lastName), asc(members.firstName));
	return rows.map((m) => ({
		...m,
		beitragspflichtig: isBeitragspflichtig(m.status),
		linked: m.userId != null,
	}));
}

export type MemberListItem = Awaited<ReturnType<typeof listMembers>>[number];

export async function createMember(input: MemberInput) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	try {
		const parsed = memberInputSchema.parse(input);
		const [row] = await db
			.insert(members)
			.values({
				...toValues(parsed),
				createdBy: guard.userId,
				updatedBy: guard.userId,
			})
			.returning();
		revalidatePath("/adressliste");
		return { success: true as const, data: row };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error creating member:", error);
		return { success: false as const, error: "Fehler beim Erstellen" };
	}
}

export async function updateMember(id: string, input: MemberInput) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	try {
		const parsed = memberInputSchema.parse(input);
		const [row] = await db
			.update(members)
			.set({ ...toValues(parsed), updatedBy: guard.userId })
			.where(eq(members.id, id))
			.returning();
		if (!row)
			return { success: false as const, error: "Mitglied nicht gefunden" };
		revalidatePath("/adressliste");
		return { success: true as const, data: row };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating member:", error);
		return { success: false as const, error: "Fehler beim Speichern" };
	}
}

export async function setAddressNeedsUpdate(id: string, value: boolean) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	await db
		.update(members)
		.set({ addressNeedsUpdate: value, updatedBy: guard.userId })
		.where(eq(members.id, id));
	revalidatePath("/adressliste");
	return { success: true as const };
}

export async function deleteMember(id: string) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	// Don't delete a member with paid Beitrag history.
	const [row] = await db
		.select({ c: sql<number>`count(*)` })
		.from(semesterbeitragCharges)
		.where(
			and(
				eq(semesterbeitragCharges.memberId, id),
				eq(semesterbeitragCharges.status, "Bezahlt"),
			),
		);
	if (Number(row?.c ?? 0) > 0) {
		return {
			success: false as const,
			error: "Mitglied hat bezahlte Beiträge und kann nicht gelöscht werden.",
		};
	}
	await db.delete(members).where(eq(members.id, id));
	revalidatePath("/adressliste");
	return { success: true as const };
}
