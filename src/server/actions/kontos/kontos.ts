"use server";

// The Kassen's bank accounts (/konten). Admins manage every Konto, a Kasse
// role (Getränkewart, CC-Kasse, Aktivenkasse) the Konto of its own Kasse.
// The mutations answer with an ActionResult (#216); getKontos is read by
// the page loader and throws for callers who are not members.

import { eq } from "drizzle-orm";
import { z } from "zod";
import { isValidIban, normalizeIban } from "~/lib/iban";
import type { KasseType } from "~/lib/kasse-types";
import { kontos } from "~/server/db/schema";
import { AuthzError, ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { NotFoundError, ValidationError } from "~/server/lib/domain-error";
import { scopeOf } from "~/server/lib/tenant-scope";

export type Konto = typeof kontos.$inferSelect;

export type KontoInput = {
	kasseType: KasseType;
	iban: string;
	bic: string;
	bankName: string;
	paypalLink?: string | null;
	description?: string;
	isActive?: boolean;
};

const kontoInput = z.object({
	kasseType: z.string(),
	iban: z.string(),
	bic: z.string(),
	bankName: z.string(),
	paypalLink: z.string().nullable().optional(),
	description: z.string().optional(),
	isActive: z.boolean().optional(),
}) satisfies z.ZodType<KontoInput>;

// ─── Permission helpers ───────────────────────────────────────────────────────

// Maps kasse type to the role that may manage it (besides Admin)
const KASSE_ROLE_MAP: Partial<Record<KasseType, string>> = {
	Getränkekasse: "Getränkewart",
	Aktivenkasse: "Aktivenkasse",
	"CC-Kasse": "CC-Kasse",
};

function isAdmin(roleNames: readonly string[]) {
	return roleNames.includes("Admin");
}

// Kontos are shown to members as payment targets (bill PDF, profile), so a
// truncated or mistyped IBAN must be rejected before it is stored.
const INVALID_IBAN_ERROR =
	"Ungültige IBAN. Bitte Länge und Prüfziffer kontrollieren.";

function canManageKonto(roleNames: readonly string[], konto: Konto) {
	if (isAdmin(roleNames)) {
		return true;
	}
	const requiredRole = KASSE_ROLE_MAP[konto.kasseType];
	return !!requiredRole && roleNames.includes(requiredRole);
}

// ─── Read ─────────────────────────────────────────────────────────────────────

/** The Kontos the caller manages (all of them for Admins). */
export async function getKontos(): Promise<Konto[]> {
	const { member, tenantId } = await requireCaller();
	const { db } = await scopeOf(tenantId);
	const all = await db.select().from(kontos).orderBy(kontos.kasseType);
	return all.filter((k) => canManageKonto(member.roles, k));
}

// ─── Create (Admin only) ──────────────────────────────────────────────────────

export const createKonto = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([kontoInput]),
		revalidate: ["/konten"],
		errorMessage: "Konto konnte nicht angelegt werden",
	},
	async ([input], { tenant }) => {
		if (!isValidIban(input.iban)) {
			throw new ValidationError(INVALID_IBAN_ERROR);
		}
		const [row] = await tenant.db
			.insert(kontos)
			.values({
				kasseType: input.kasseType,
				iban: normalizeIban(input.iban),
				bic: input.bic,
				bankName: input.bankName,
				paypalLink: input.paypalLink ?? null,
				description: input.description ?? null,
				isActive: input.isActive ?? true,
			})
			.returning({ id: kontos.id });
		if (!row) {
			throw new Error("Insert failed");
		}
		return { id: row.id };
	},
);

// ─── Update (Admin or mapped role) ───────────────────────────────────────────

export const updateKonto = defineAction(
	{
		schema: z.tuple([z.string(), kontoInput.partial()]),
		revalidate: ["/konten"],
		errorMessage: "Konto konnte nicht gespeichert werden",
	},
	async ([id, input], { tenant, user }) => {
		const [existing] = await tenant.db
			.select()
			.from(kontos)
			.where(eq(kontos.id, id))
			.limit(1);
		if (!existing) {
			throw new NotFoundError("Konto nicht gefunden");
		}
		if (!canManageKonto(user.roles, existing)) {
			throw new AuthzError("FORBIDDEN");
		}
		if (input.iban !== undefined && !isValidIban(input.iban)) {
			throw new ValidationError(INVALID_IBAN_ERROR);
		}

		const updateData: Partial<typeof kontos.$inferInsert> = {};
		if (input.iban !== undefined) {
			updateData.iban = normalizeIban(input.iban);
		}
		if (input.bic !== undefined) {
			updateData.bic = input.bic;
		}
		if (input.bankName !== undefined) {
			updateData.bankName = input.bankName;
		}
		if (input.paypalLink !== undefined) {
			updateData.paypalLink = input.paypalLink;
		}
		if (input.description !== undefined) {
			updateData.description = input.description;
		}
		if (input.isActive !== undefined) {
			updateData.isActive = input.isActive;
		}
		// Only admin may change the type
		if (isAdmin(user.roles) && input.kasseType !== undefined) {
			updateData.kasseType = input.kasseType;
		}

		await tenant.db.update(kontos).set(updateData).where(eq(kontos.id, id));
	},
);

// ─── Delete (Admin only) ──────────────────────────────────────────────────────

export const deleteKonto = defineAction(
	{
		roles: ROLES.admin,
		schema: z.tuple([z.string()]),
		revalidate: ["/konten"],
		errorMessage: "Konto konnte nicht gelöscht werden",
	},
	async ([id], { tenant }) => {
		await tenant.db.delete(kontos).where(eq(kontos.id, id));
	},
);
