"use server";

// The Adressliste: the member directory, for Admins and the AHV Vorstand.
// The lists are read by the page loader; the mutations answer with an
// ActionResult (#216).

import { and, asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "~/server/db";
import { members, semesterbeitragCharges } from "~/server/db/schema";
import { requireMember } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import {
	getTenantMemberStatuses,
	makeBeitragspflichtigMatcher,
} from "~/server/lib/member-statuses";
import { MEMBER_EDIT_ROLES, MEMBER_VIEW_ROLES, requireRoles } from "./_guards";
import { tryAutoLinkMember } from "./link-helpers";
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
	if (!guard.ok) {
		return [];
	}
	const isBeitragspflichtig = makeBeitragspflichtigMatcher(
		await getTenantMemberStatuses(),
	);
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

// Canonical status options for the Adressliste dropdowns, from the tenant's
// member_status config table (defaults if not yet seeded).
export async function listMemberStatusOptions(): Promise<
	{ value: string; label: string }[]
> {
	await requireMember();
	const guard = await requireRoles(MEMBER_VIEW_ROLES);
	if (!guard.ok) {
		return [];
	}
	const statuses = await getTenantMemberStatuses();
	return statuses.map((s) => ({ value: s.key, label: s.label }));
}

export type MemberListItem = Awaited<ReturnType<typeof listMembers>>[number];

export const createMember = defineAction(
	{
		roles: MEMBER_EDIT_ROLES,
		schema: z.tuple([memberInputSchema]),
		revalidate: ["/adressliste"],
		errorMessage: "Fehler beim Erstellen",
	},
	async ([input], { tenant, user }) => {
		const [row] = await tenant.db
			.insert(members)
			.values({
				...toValues(input),
				createdBy: user.id,
				updatedBy: user.id,
			})
			.returning();
		if (!row) {
			throw new Error("member insert returned no row");
		}
		// If one of the emails matches an existing account, link it right away.
		const linkedNow = await tryAutoLinkMember(row.id);
		return { member: row, linkedNow };
	},
);

export const updateMember = defineAction(
	{
		roles: MEMBER_EDIT_ROLES,
		schema: z.tuple([z.string(), memberInputSchema]),
		revalidate: ["/adressliste"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, input], { tenant, user }) => {
		const [row] = await tenant.db
			.update(members)
			.set({ ...toValues(input), updatedBy: user.id })
			.where(eq(members.id, id))
			.returning();
		if (!row) {
			throw new NotFoundError("Mitglied nicht gefunden");
		}
		// A corrected email may now match an existing account — link it right away.
		const linkedNow = row.userId == null ? await tryAutoLinkMember(id) : false;
		return { member: row, linkedNow };
	},
);

const REQUIRED_FIELDS = new Set(["firstName", "lastName", "status"]);
// The table sends one or more cells as a loose record.
const editableFieldsSchema = z
	.record(z.string(), z.unknown())
	.pipe(memberInputSchema.partial());

// Partial update for in-place table editing (one or more fields).
export const updateMemberFields = defineAction(
	{
		roles: MEMBER_EDIT_ROLES,
		schema: z.tuple([z.string(), editableFieldsSchema]),
		revalidate: ["/adressliste"],
		errorMessage: "Fehler beim Speichern",
	},
	async ([id, patch], { tenant, user }) => {
		const set: Record<string, unknown> = {};
		for (const [k, val] of Object.entries(patch)) {
			if (val === undefined) {
				continue;
			}
			if (typeof val === "string") {
				const t = val.trim();
				if (REQUIRED_FIELDS.has(k) && t === "") {
					continue; // never blank a required field
				}
				if (k === "status") {
					set[k] = normalizeStatus(t);
				} else {
					set[k] = REQUIRED_FIELDS.has(k) ? t : t || null;
				}
			} else {
				set[k] = val;
			}
		}
		if (Object.keys(set).length === 0) {
			throw new ValidationError("Keine Änderungen");
		}
		set.updatedBy = user.id;
		await tenant.db.update(members).set(set).where(eq(members.id, id));
		// A corrected email may now match an existing account — link it right away.
		const emailTouched = ["email", "email2", "email3"].some((k) => k in set);
		const linkedNow = emailTouched ? await tryAutoLinkMember(id) : false;
		return { linkedNow };
	},
);

export const deleteMember = defineAction(
	{
		roles: MEMBER_EDIT_ROLES,
		schema: z.tuple([z.string()]),
		revalidate: ["/adressliste"],
		errorMessage: "Fehler beim Löschen",
	},
	async ([id], { tenant }) => {
		const [row] = await tenant.db
			.select({ c: sql<number>`count(*)` })
			.from(semesterbeitragCharges)
			.where(
				and(
					eq(semesterbeitragCharges.memberId, id),
					eq(semesterbeitragCharges.status, "Bezahlt"),
				),
			);
		if (Number(row?.c ?? 0) > 0) {
			throw new ConflictError(
				"Mitglied hat bezahlte Beiträge und kann nicht gelöscht werden.",
			);
		}
		await tenant.db.delete(members).where(eq(members.id, id));
	},
);
