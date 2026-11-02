// service.ts — the Kassen's bank accounts (/konten) (#33).
//
// Admins manage every Konto, a Kasse role (Getränkewart, CC-Kasse,
// Aktivenkasse) the Konto of its own Kasse. Kontos are shown to members as
// payment targets (bill PDF, profile), so an IBAN is checked before it is
// stored. Every function takes the TenantScope it works in; failures the
// user should read are DomainErrors.

import "server-only";

import { z } from "zod";
import { isValidIban, normalizeIban } from "~/lib/iban";
import type { KasseType } from "~/lib/kasse-types";
import { AuthzError } from "~/server/lib/authz";
import { NotFoundError, ValidationError } from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type { Konto } from "./repo";

export type KontoInput = {
	kasseType: KasseType;
	iban: string;
	bic: string;
	bankName: string;
	paypalLink?: string | null;
	description?: string;
	isActive?: boolean;
};

export const kontoInputSchema = z.object({
	kasseType: z.string(),
	iban: z.string(),
	bic: z.string(),
	bankName: z.string(),
	paypalLink: z.string().nullable().optional(),
	description: z.string().optional(),
	isActive: z.boolean().optional(),
}) satisfies z.ZodType<KontoInput>;

type Input = z.output<typeof kontoInputSchema>;

// ─── Permissions ─────────────────────────────────────────────────────────────

// Maps kasse type to the role that may manage it (besides Admin)
const KASSE_ROLE_MAP: Partial<Record<KasseType, string>> = {
	Getränkekasse: "Getränkewart",
	Aktivenkasse: "Aktivenkasse",
	"CC-Kasse": "CC-Kasse",
};

function isAdmin(roleNames: readonly string[]) {
	return roleNames.includes("Admin");
}

function canManageKonto(roleNames: readonly string[], konto: repo.Konto) {
	if (isAdmin(roleNames)) {
		return true;
	}
	const requiredRole = KASSE_ROLE_MAP[konto.kasseType];
	return !!requiredRole && roleNames.includes(requiredRole);
}

// A truncated or mistyped IBAN must be rejected before it is stored.
const INVALID_IBAN_ERROR =
	"Ungültige IBAN. Bitte Länge und Prüfziffer kontrollieren.";

type Actor = { roles: readonly string[] };

// ─── Reads and changes ───────────────────────────────────────────────────────

/** The Kontos the member manages (all of them for Admins). */
export async function managedKontos({ db }: TenantScope, actor: Actor) {
	const all = await repo.listKontos(db);
	return all.filter((k) => canManageKonto(actor.roles, k));
}

export async function createKonto({ db }: TenantScope, input: Input) {
	if (!isValidIban(input.iban)) {
		throw new ValidationError(INVALID_IBAN_ERROR);
	}
	const id = await repo.insertKonto(db, {
		kasseType: input.kasseType,
		iban: normalizeIban(input.iban),
		bic: input.bic,
		bankName: input.bankName,
		paypalLink: input.paypalLink ?? null,
		description: input.description ?? null,
		isActive: input.isActive ?? true,
	});
	if (!id) {
		throw new Error("Insert failed");
	}
	return { id };
}

/** Admins change any field; a Kasse role its own Konto, but not the type. */
export async function updateKonto(
	{ db }: TenantScope,
	actor: Actor,
	kontoId: string,
	input: Partial<Input>,
) {
	const existing = await repo.kontoById(db, kontoId);
	if (!existing) {
		throw new NotFoundError("Konto nicht gefunden");
	}
	if (!canManageKonto(actor.roles, existing)) {
		throw new AuthzError("FORBIDDEN");
	}
	if (input.iban !== undefined && !isValidIban(input.iban)) {
		throw new ValidationError(INVALID_IBAN_ERROR);
	}

	const updateData: Partial<repo.KontoInsert> = {};
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
	if (isAdmin(actor.roles) && input.kasseType !== undefined) {
		updateData.kasseType = input.kasseType;
	}

	await repo.updateKonto(db, kontoId, updateData);
}

export async function deleteKonto({ db }: TenantScope, kontoId: string) {
	await repo.deleteKonto(db, kontoId);
}
