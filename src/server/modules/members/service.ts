// service.ts — the Adressliste: member rows, the status taxonomy, account
// links and the caller's own entry (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The Excel import and export are in ./excel.

import "server-only";

import { z } from "zod";
import type { TenantDb } from "~/server/db/tenants";
import { normalizeStatus } from "~/server/domain/members/excel-map";
import {
	makeBeitragspflichtigMatcher,
	type TenantMemberStatus,
} from "~/server/domain/members/statuses";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import { hasActiveMembership } from "~/server/lib/tenant-context";
import { DEFAULT_MEMBER_STATUSES } from "~/server/lib/tenant-default-config";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

type Actor = { id: string };

const clean = (s?: string | null): string | null => {
	const t = s?.trim();
	return t ? t : null;
};

// ─── Statuses ────────────────────────────────────────────────────────────────

/**
 * The tenant's active member statuses in display order. Tenants whose
 * config table is empty (not yet backfilled) get the German Corps defaults,
 * which reproduce the previously hardcoded behavior.
 */
export async function memberStatuses({
	db,
}: TenantScope): Promise<TenantMemberStatus[]> {
	const active = (await repo.listMemberStatuses(db)).filter((r) => r.isActive);
	if (active.length > 0) {
		return active;
	}
	return DEFAULT_MEMBER_STATUSES.map((d) => ({
		key: d.key,
		label: d.label,
		beitragspflichtig: d.beitragspflichtig,
	}));
}

/** The status options of the Adressliste dropdowns. */
export async function statusOptions(
	tenant: TenantScope,
): Promise<{ value: string; label: string }[]> {
	const statuses = await memberStatuses(tenant);
	return statuses.map((s) => ({ value: s.key, label: s.label }));
}

// ─── The Adressliste ─────────────────────────────────────────────────────────

/** Every member with whether they owe the Semesterbeitrag and are linked. */
export async function directory(tenant: TenantScope) {
	const isBeitragspflichtig = makeBeitragspflichtigMatcher(
		await memberStatuses(tenant),
	);
	const rows = await repo.listMembers(tenant.db);
	return rows.map((m) => ({
		...m,
		beitragspflichtig: isBeitragspflichtig(m.status),
		linked: m.userId != null,
	}));
}

export type MemberListItem = Awaited<ReturnType<typeof directory>>[number];

const str = z.string().max(255).nullable().optional();

export const memberInputSchema = z.object({
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

type MemberInput = z.infer<typeof memberInputSchema>;

function toValues(p: MemberInput) {
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

/** Adds a member and links it right away if one of its emails matches an account. */
export async function createMember(
	tenant: TenantScope,
	actor: Actor,
	input: MemberInput,
) {
	const row = await repo.insertMember(tenant.db, {
		...toValues(input),
		createdBy: actor.id,
		updatedBy: actor.id,
	});
	if (!row) {
		throw new Error("member insert returned no row");
	}
	const linkedNow = await tryAutoLink(tenant, row.id);
	return { member: row, linkedNow };
}

/** Replaces a member's data; a corrected email may link it right away. */
export async function updateMember(
	tenant: TenantScope,
	actor: Actor,
	id: string,
	input: MemberInput,
) {
	const row = await repo.updateMember(tenant.db, id, {
		...toValues(input),
		updatedBy: actor.id,
	});
	if (!row) {
		throw new NotFoundError("Mitglied nicht gefunden");
	}
	const linkedNow = row.userId == null ? await tryAutoLink(tenant, id) : false;
	return { member: row, linkedNow };
}

const REQUIRED_FIELDS = new Set(["firstName", "lastName", "status"]);

/** The table sends one or more cells as a loose record. */
export const editableFieldsSchema = z
	.record(z.string(), z.unknown())
	.pipe(memberInputSchema.partial());

/** Partial update for in-place table editing (one or more fields). */
export async function updateMemberFields(
	tenant: TenantScope,
	actor: Actor,
	id: string,
	patch: Partial<MemberInput>,
) {
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
	set.updatedBy = actor.id;
	await repo.patchMember(tenant.db, id, set);
	// A corrected email may now match an existing account — link it right away.
	const emailTouched = ["email", "email2", "email3"].some((k) => k in set);
	const linkedNow = emailTouched ? await tryAutoLink(tenant, id) : false;
	return { linkedNow };
}

/** Deletes a member, unless a paid Beitrag (a financial record) refers to it. */
export async function deleteMember({ db }: TenantScope, id: string) {
	if ((await repo.countPaidCharges(db, id)) > 0) {
		throw new ConflictError(
			"Mitglied hat bezahlte Beiträge und kann nicht gelöscht werden.",
		);
	}
	await repo.deleteMember(db, id);
}

// ─── Accounts ────────────────────────────────────────────────────────────────
//
// A member is linked to a user account only when the match is unambiguous:
// the member's emails (email/email2/email3) resolve to exactly ONE account
// that is not already linked to another member, and that account matches no
// other unlinked member. Mirrors the caution of myMember below — never guess
// when a human should decide.

const norm = (e: string | null | undefined): string | null => {
	const t = e?.trim().toLowerCase();
	return t || null;
};

export type LinkCandidate = { memberId: string; userId: string; name: string };

/**
 * All unambiguous member↔account pairs among unlinked members and accounts
 * not yet linked to any member.
 */
export async function linkablePairs(db: TenantDb): Promise<{
	pairs: LinkCandidate[];
	ambiguous: number;
}> {
	const { allMembers, allUsers } = await repo.linkingState(db);

	const takenUsers = new Set(
		allMembers.map((m) => m.userId).filter((v): v is string => v != null),
	);
	// users.email is unique, so each email maps to at most one free account.
	const freeUserByEmail = new Map<string, string>();
	for (const u of allUsers) {
		if (takenUsers.has(u.id)) {
			continue;
		}
		const e = norm(u.email);
		if (e) {
			freeUserByEmail.set(e, u.id);
		}
	}

	let ambiguous = 0;
	const candidates: LinkCandidate[] = [];
	const matchesPerUser = new Map<string, number>();

	for (const m of allMembers) {
		if (m.userId) {
			continue;
		}
		const hits = new Set<string>();
		for (const raw of [m.email, m.email2, m.email3]) {
			const e = norm(raw);
			const uid = e ? freeUserByEmail.get(e) : undefined;
			if (uid) {
				hits.add(uid);
			}
		}
		if (hits.size === 0) {
			continue;
		}
		if (hits.size > 1) {
			// The member's emails point at two different accounts.
			ambiguous++;
			continue;
		}
		const [userId] = hits;
		if (!userId) {
			continue;
		}
		candidates.push({
			memberId: m.id,
			userId,
			name: `${m.firstName} ${m.lastName}`,
		});
		matchesPerUser.set(userId, (matchesPerUser.get(userId) ?? 0) + 1);
	}

	// The same account matching several members is ambiguous too.
	const pairs = candidates.filter((c) => matchesPerUser.get(c.userId) === 1);
	ambiguous += candidates.length - pairs.length;
	return { pairs, ambiguous };
}

/** Links every unambiguous pair; never relinks or overwrites a link. */
export async function linkAll(
	db: TenantDb,
): Promise<{ pairs: LinkCandidate[]; ambiguous: number }> {
	const result = await linkablePairs(db);
	for (const p of result.pairs) {
		await repo.linkMember(db, p.memberId, p.userId);
	}
	return result;
}

/**
 * Manual resync: sweeps all unlinked members and attaches accounts with
 * unambiguous email matches (any of email/email2/email3).
 */
export async function relinkAll({ db }: TenantScope) {
	const { pairs, ambiguous } = await linkAll(db);
	return {
		linked: pairs.length,
		ambiguous,
		linkedNames: pairs.map((p) => p.name),
	};
}

/** Tries to link one member right after its emails changed. */
export async function tryAutoLink(
	{ db }: TenantScope,
	memberId: string,
): Promise<boolean> {
	const { pairs } = await linkablePairs(db);
	const pair = pairs.find((p) => p.memberId === memberId);
	if (!pair) {
		return false;
	}
	await repo.linkMember(db, pair.memberId, pair.userId);
	return true;
}

// ─── The caller's own entry ──────────────────────────────────────────────────

/**
 * The member row of `user`: by userId, else the single unlinked member
 * whose email matches (case-insensitive), which is linked on the way. Null
 * if there is no match or an ambiguous (>1) match.
 */
export async function myMember(
	{ tenantId, db }: TenantScope,
	user: { id: string; email?: string | null },
): Promise<repo.Member | null> {
	// Sessions are global across tenants — never resolve (and especially never
	// auto-link) a member row for someone who isn't a member of THIS tenant.
	if (!(await hasActiveMembership(user.id, tenantId))) {
		return null;
	}

	const byUser = await repo.memberOfUser(db, user.id);
	if (byUser) {
		return byUser;
	}
	const email = user.email ?? null;
	if (!email) {
		return null;
	}

	const matches = await repo.unlinkedMembersWithEmail(db, email);
	if (matches.length !== 1) {
		return null;
	}
	const m = matches[0];
	if (!m) {
		return null;
	}
	// Race-guarded link.
	await repo.linkMember(db, m.id, user.id);
	return { ...m, userId: user.id };
}

/**
 * What members may edit of their own data: everything EXCEPT their status
 * (Abteilung) and the management-only "Adresse veraltet" flag.
 */
export const selfSchema = z.object({
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

/** Saves the caller's own entry. */
export async function updateMyMember(
	tenant: TenantScope,
	user: { id: string; email?: string | null },
	p: z.infer<typeof selfSchema>,
) {
	const member = await myMember(tenant, user);
	if (!member) {
		throw new NotFoundError(
			"Kein Mitgliedseintrag gefunden — wende dich an den Senior.",
		);
	}
	await repo.patchMember(tenant.db, member.id, {
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
		updatedBy: user.id,
	});
}
