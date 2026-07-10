// link-helpers.ts — shared member↔account email-matching logic.
//
// A member is linked to a user account only when the match is unambiguous:
// the member's emails (email/email2/email3) resolve to exactly ONE account
// that is not already linked to another member, and that account matches no
// other unlinked member. Mirrors the caution of resolveMyMember in
// myMember.ts — never guess when a human should decide.

import { and, eq, isNull } from "drizzle-orm";
import { db } from "~/server/db";
import { members, users } from "~/server/db/schema";

const norm = (e: string | null | undefined): string | null => {
	const t = e?.trim().toLowerCase();
	return t || null;
};

export type LinkCandidate = { memberId: string; userId: string; name: string };

// Compute all unambiguous member↔account pairs among unlinked members and
// accounts not yet linked to any member.
export async function computeLinkablePairs(): Promise<{
	pairs: LinkCandidate[];
	ambiguous: number;
}> {
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

	const takenUsers = new Set(
		allMembers.map((m) => m.userId).filter((v): v is string => v != null),
	);
	// users.email is unique, so each email maps to at most one free account.
	const freeUserByEmail = new Map<string, string>();
	for (const u of allUsers) {
		if (takenUsers.has(u.id)) continue;
		const e = norm(u.email);
		if (e) freeUserByEmail.set(e, u.id);
	}

	let ambiguous = 0;
	const candidates: LinkCandidate[] = [];
	const matchesPerUser = new Map<string, number>();

	for (const m of allMembers) {
		if (m.userId) continue;
		const hits = new Set<string>();
		for (const raw of [m.email, m.email2, m.email3]) {
			const e = norm(raw);
			const uid = e ? freeUserByEmail.get(e) : undefined;
			if (uid) hits.add(uid);
		}
		if (hits.size === 0) continue;
		if (hits.size > 1) {
			// The member's emails point at two different accounts.
			ambiguous++;
			continue;
		}
		const [userId] = hits;
		if (!userId) continue;
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

// Race-guarded: only writes while the member is still unlinked.
export async function applyLink(memberId: string, userId: string) {
	await db
		.update(members)
		.set({ userId })
		.where(and(eq(members.id, memberId), isNull(members.userId)));
}

// Try to link one member right after its emails changed.
// Returns true if a link was created.
export async function tryAutoLinkMember(memberId: string): Promise<boolean> {
	const { pairs } = await computeLinkablePairs();
	const pair = pairs.find((p) => p.memberId === memberId);
	if (!pair) return false;
	await applyLink(pair.memberId, pair.userId);
	return true;
}
