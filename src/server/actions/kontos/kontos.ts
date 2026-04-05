"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import type { KasseType } from "~/lib/kasse-types";
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { kontos, roles, userRoles } from "~/server/db/schema";

export type Konto = typeof kontos.$inferSelect;

export type KontoInput = {
	kasseType: KasseType;
	iban: string;
	bic: string;
	bankName: string;
	description?: string;
	isActive?: boolean;
};

// ─── Permission helpers ───────────────────────────────────────────────────────

// Maps kasse type to the role that may manage it (besides Admin)
const KASSE_ROLE_MAP: Partial<Record<KasseType, string>> = {
	Getränkekasse: "Getränkewart",
	Aktivenkasse: "Aktivenkasse",
	"CC-Kasse": "CCKasse",
};

async function getUserRoleNames(userId: string): Promise<string[]> {
	const rows = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
	return rows.map((r) => r.name);
}

function isAdmin(roleNames: string[]) {
	return roleNames.includes("Admin");
}

function canManageKonto(roleNames: string[], konto: Konto) {
	if (isAdmin(roleNames)) return true;
	const requiredRole = KASSE_ROLE_MAP[konto.kasseType];
	return !!requiredRole && roleNames.includes(requiredRole);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getKontos(): Promise<
	{ success: true; kontos: Konto[] } | { success: false; error: string }
> {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	const roleNames = await getUserRoleNames(session.user.id);
	const all = await db.select().from(kontos).orderBy(kontos.kasseType);

	const visible = isAdmin(roleNames)
		? all
		: all.filter((k) => canManageKonto(roleNames, k));

	return { success: true, kontos: visible };
}

// ─── Create (Admin only) ──────────────────────────────────────────────────────

export async function createKonto(
	input: KontoInput,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	const roleNames = await getUserRoleNames(session.user.id);
	if (!isAdmin(roleNames))
		return { success: false, error: "Keine Berechtigung" };

	const [row] = await db
		.insert(kontos)
		.values({
			kasseType: input.kasseType,
			iban: input.iban,
			bic: input.bic,
			bankName: input.bankName,
			description: input.description ?? null,
			isActive: input.isActive ?? true,
		})
		.returning({ id: kontos.id });

	revalidatePath("/konten");
	return { success: true, id: row.id };
}

// ─── Update (Admin or mapped role) ───────────────────────────────────────────

export async function updateKonto(
	id: string,
	input: Partial<KontoInput>,
): Promise<{ success: true } | { success: false; error: string }> {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	const [existing] = await db
		.select()
		.from(kontos)
		.where(eq(kontos.id, id))
		.limit(1);
	if (!existing) return { success: false, error: "Konto nicht gefunden" };

	const roleNames = await getUserRoleNames(session.user.id);
	if (!canManageKonto(roleNames, existing))
		return { success: false, error: "Keine Berechtigung" };

	const updateData: Partial<typeof kontos.$inferInsert> = {};
	if (input.iban !== undefined) updateData.iban = input.iban;
	if (input.bic !== undefined) updateData.bic = input.bic;
	if (input.bankName !== undefined) updateData.bankName = input.bankName;
	if (input.description !== undefined)
		updateData.description = input.description;
	if (input.isActive !== undefined) updateData.isActive = input.isActive;
	// Only admin may change the type
	if (isAdmin(roleNames) && input.kasseType !== undefined) {
		updateData.kasseType = input.kasseType;
	}

	await db.update(kontos).set(updateData).where(eq(kontos.id, id));
	revalidatePath("/konten");
	return { success: true };
}

// ─── Delete (Admin only) ──────────────────────────────────────────────────────

export async function deleteKonto(
	id: string,
): Promise<{ success: true } | { success: false; error: string }> {
	const session = await auth();
	if (!session?.user?.id) return { success: false, error: "Nicht angemeldet" };

	const roleNames = await getUserRoleNames(session.user.id);
	if (!isAdmin(roleNames))
		return { success: false, error: "Keine Berechtigung" };

	await db.delete(kontos).where(eq(kontos.id, id));
	revalidatePath("/konten");
	return { success: true };
}
