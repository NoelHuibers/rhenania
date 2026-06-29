"use server";

import { and, asc, eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { db } from "~/server/db";
import { members, semesterbeitragCharges } from "~/server/db/schema";
import {
	isBeitragspflichtig,
	MEMBER_EDIT_ROLES,
	MEMBER_VIEW_ROLES,
	requireRoles,
} from "./_guards";
import { normalizeStatus } from "./members-excel-map";

const clean = (s?: string | null): string | null => {
	const t = s?.trim();
	return t ? t : null;
};

const str = z.string().max(255).nullable().optional();

const memberInputSchema = z.object({
	status: z.string().trim().min(1, "Status erforderlich").max(50),
	firstName: z.string().trim().min(1, "Vorname erforderlich").max(255),
	lastName: z.string().trim().min(1, "Nachname erforderlich").max(255),
	email: str,
	email2: str,
	email3: str,
	title: str,
	mobile: z.string().max(100).nullable().optional(),
	phonePrivate: z.string().max(100).nullable().optional(),
	phonePrivate2: z.string().max(100).nullable().optional(),
	phoneWork: z.string().max(100).nullable().optional(),
	phoneWork2: z.string().max(100).nullable().optional(),
	company: str,
	birthday: z.string().max(50).nullable().optional(),
	street: str,
	houseNumber: z.string().max(50).nullable().optional(),
	addressLine2: str,
	postalCode: z.string().max(20).nullable().optional(),
	city: str,
	country: z.string().max(100).nullable().optional(),
	forwarding: z.boolean().optional(),
	lettersOptOut: z.boolean().optional(),
	addressNeedsUpdate: z.boolean().optional(),
	notes: z.string().max(1000).nullable().optional(),
	externalId: z.string().max(100).nullable().optional(),
});

type MemberInput = z.input<typeof memberInputSchema>;

function toValues(p: z.infer<typeof memberInputSchema>) {
	return {
		status: normalizeStatus(p.status),
		firstName: p.firstName.trim(),
		lastName: p.lastName.trim(),
		email: clean(p.email),
		email2: clean(p.email2),
		email3: clean(p.email3),
		title: clean(p.title),
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
		forwarding: p.forwarding ?? false,
		lettersOptOut: p.lettersOptOut ?? false,
		addressNeedsUpdate: p.addressNeedsUpdate ?? false,
		notes: clean(p.notes),
		externalId: clean(p.externalId),
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

const REQUIRED_FIELDS = new Set(["firstName", "lastName", "status"]);
const editableFieldsSchema = memberInputSchema.partial();

// Partial update for in-place table editing (one or more fields).
export async function updateMemberFields(
	id: string,
	patch: Record<string, unknown>,
) {
	const guard = await requireRoles(MEMBER_EDIT_ROLES);
	if (!guard.ok) return { success: false as const, error: guard.error };
	try {
		const parsed = editableFieldsSchema.parse(patch);
		const set: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(parsed)) {
			if (val === undefined) continue;
			if (typeof val === "string") {
				const t = val.trim();
				if (REQUIRED_FIELDS.has(k) && t === "") continue; // never blank a required field
				if (k === "status") set[k] = normalizeStatus(t);
				else set[k] = REQUIRED_FIELDS.has(k) ? t : t || null;
			} else {
				set[k] = val;
			}
		}
		if (Object.keys(set).length === 0) {
			return { success: false as const, error: "Keine Änderungen" };
		}
		set.updatedBy = guard.userId;
		await db.update(members).set(set).where(eq(members.id, id));
		revalidatePath("/adressliste");
		return { success: true as const };
	} catch (error) {
		if (error instanceof z.ZodError) {
			return {
				success: false as const,
				error: error.issues[0]?.message ?? "Validierungsfehler",
			};
		}
		console.error("Error updating member fields:", error);
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
