// repo.ts — the Adressliste in the tenant DB (#33).
//
// Drizzle reads and writes of the member rows, the member status config and
// what account linking needs from the user mirror. Every function takes the
// database it runs on; none checks the caller, applies a rule or revalidates
// a page. A read that may find nothing returns null or []; a failed query
// throws.

import "server-only";

import { and, asc, eq, isNull, sql } from "drizzle-orm";
import {
	type Member,
	memberStatuses,
	members,
	semesterbeitragCharges,
	users,
} from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type { Member };
export type MemberInsert = typeof members.$inferInsert;

// ─── Member rows ─────────────────────────────────────────────────────────────

/** Every member, by last and first name (the Adressliste). */
export async function listMembers(db: TenantDb): Promise<Member[]> {
	return db
		.select()
		.from(members)
		.orderBy(asc(members.lastName), asc(members.firstName));
}

/** Every member, by last and first name (the Excel export's order). */
export async function listMembersForExport(db: TenantDb): Promise<Member[]> {
	return db.select().from(members).orderBy(members.lastName, members.firstName);
}

/** Every member, unordered (the Excel import's matching). */
export async function allMembers(db: TenantDb): Promise<Member[]> {
	return db.select().from(members);
}

export async function insertMember(
	db: TenantDb,
	values: MemberInsert,
): Promise<Member | null> {
	const [row] = await db.insert(members).values(values).returning();
	return row ?? null;
}

/** Inserts a member and answers its id (the Excel import). */
export async function insertMemberId(
	db: TenantDb,
	values: MemberInsert,
): Promise<string | null> {
	const [row] = await db
		.insert(members)
		.values(values)
		.returning({ id: members.id });
	return row?.id ?? null;
}

/** Updates a member and answers the new row, or null if there is none. */
export async function updateMember(
	db: TenantDb,
	id: string,
	values: Partial<MemberInsert>,
): Promise<Member | null> {
	const [row] = await db
		.update(members)
		.set(values)
		.where(eq(members.id, id))
		.returning();
	return row ?? null;
}

/** Updates a member without reading it back. */
export async function patchMember(
	db: TenantDb,
	id: string,
	values: Partial<MemberInsert>,
): Promise<void> {
	await db.update(members).set(values).where(eq(members.id, id));
}

export async function deleteMember(db: TenantDb, id: string): Promise<void> {
	await db.delete(members).where(eq(members.id, id));
}

/** How many of the member's Semesterbeiträge are paid. */
export async function countPaidCharges(
	db: TenantDb,
	memberId: string,
): Promise<number> {
	const [row] = await db
		.select({ c: sql<number>`count(*)` })
		.from(semesterbeitragCharges)
		.where(
			and(
				eq(semesterbeitragCharges.memberId, memberId),
				eq(semesterbeitragCharges.status, "Bezahlt"),
			),
		);
	return Number(row?.c ?? 0);
}

// ─── Status config ───────────────────────────────────────────────────────────

/** The tenant's `member_status` rows in display order, inactive ones too. */
export async function listMemberStatuses(db: TenantDb) {
	return db
		.select({
			key: memberStatuses.key,
			label: memberStatuses.label,
			beitragspflichtig: memberStatuses.beitragspflichtig,
			isActive: memberStatuses.isActive,
		})
		.from(memberStatuses)
		.orderBy(asc(memberStatuses.displayOrder));
}

// ─── Accounts ────────────────────────────────────────────────────────────────

/** Members with their link and emails, and every account's email. */
export async function linkingState(db: TenantDb) {
	const [allMembers, allUsers] = await Promise.all([
		db
			.select({
				id: members.id,
				userId: members.userId,
				firstName: members.firstName,
				lastName: members.lastName,
				email: members.email,
				email2: members.email2,
				email3: members.email3,
			})
			.from(members),
		db.select({ id: users.id, email: users.email }).from(users),
	]);
	return { allMembers, allUsers };
}

/** Links the member to the account, only while it is still unlinked. */
export async function linkMember(
	db: TenantDb,
	memberId: string,
	userId: string,
): Promise<void> {
	await db
		.update(members)
		.set({ userId })
		.where(and(eq(members.id, memberId), isNull(members.userId)));
}

/** The member linked to the account, if any. */
export async function memberOfUser(
	db: TenantDb,
	userId: string,
): Promise<Member | null> {
	const row = await db.query.members.findFirst({
		where: (t, { eq }) => eq(t.userId, userId),
	});
	return row ?? null;
}

/** Unlinked members whose (first) email is `email`, ignoring case. */
export async function unlinkedMembersWithEmail(
	db: TenantDb,
	email: string,
): Promise<Member[]> {
	return db
		.select()
		.from(members)
		.where(
			and(
				isNull(members.userId),
				sql`lower(${members.email}) = lower(${email})`,
			),
		);
}
