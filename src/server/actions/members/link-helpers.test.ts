import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { members } from "~/server/db/schema";
import { createMember } from "../../../../test/factories/members";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	applyLink,
	computeLinkablePairs,
	tryAutoLinkMember,
} from "./link-helpers";
import { relinkMemberAccounts } from "./linkAccounts";

setupTestDatabases();

async function userIdOf(memberId: string) {
	const [row] = await tenantDb()
		.select({ userId: members.userId })
		.from(members)
		.where(eq(members.id, memberId));
	return row?.userId;
}

describe("computeLinkablePairs", () => {
	test("pairs an unlinked member with the one free account matching any of its emails", async () => {
		await createTenant();
		const account = await createUser({ email: "max@example.test" });
		const m = await createMember({
			firstName: "Max",
			lastName: "Muster",
			email: "alt@nowhere.test",
			email3: "  MAX@Example.test ",
		});

		expect(await computeLinkablePairs()).toEqual({
			pairs: [{ memberId: m.id, userId: account.id, name: "Max Muster" }],
			ambiguous: 0,
		});
	});

	test("a member whose emails point at two accounts is ambiguous", async () => {
		await createTenant();
		await createUser({ email: "a@example.test" });
		await createUser({ email: "b@example.test" });
		await createMember({ email: "a@example.test", email2: "b@example.test" });

		expect(await computeLinkablePairs()).toEqual({ pairs: [], ambiguous: 1 });
	});

	test("an account matching two members is ambiguous for both", async () => {
		await createTenant();
		await createUser({ email: "shared@example.test" });
		await createMember({ email: "shared@example.test" });
		await createMember({ email2: "shared@example.test" });

		expect(await computeLinkablePairs()).toEqual({ pairs: [], ambiguous: 2 });
	});

	test("accounts already linked and members already linked are skipped", async () => {
		await createTenant();
		const taken = await createUser({ email: "taken@example.test" });
		await createMember({ userId: taken.id, email: "taken@example.test" });
		await createMember({ email: "taken@example.test" });
		const free = await createUser({ email: "free@example.test" });
		await createMember({ userId: free.id, email: "x@example.test" });

		expect(await computeLinkablePairs()).toEqual({ pairs: [], ambiguous: 0 });
	});
});

describe("applyLink / tryAutoLinkMember", () => {
	test("never overwrites an existing link", async () => {
		await createTenant();
		const first = await createUser();
		const second = await createUser();
		const m = await createMember({ userId: first.id });

		await applyLink(m.id, second.id);

		expect(await userIdOf(m.id)).toBe(first.id);
	});

	test("links only the requested member", async () => {
		await createTenant();
		const a = await createUser({ email: "a@example.test" });
		await createUser({ email: "b@example.test" });
		const ma = await createMember({ email: "a@example.test" });
		const mb = await createMember({ email: "b@example.test" });

		expect(await tryAutoLinkMember(ma.id)).toBe(true);
		expect(await userIdOf(ma.id)).toBe(a.id);
		expect(await userIdOf(mb.id)).toBeNull();
		expect(await tryAutoLinkMember(ma.id)).toBe(false);
	});
});

describe("relinkMemberAccounts", () => {
	test("links every unambiguous pair and reports the rest", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		const max = await createUser({ email: "max@example.test" });
		await createUser({ email: "shared@example.test" });
		const mMax = await createMember({
			firstName: "Max",
			lastName: "Muster",
			email: "max@example.test",
		});
		await createMember({ email: "shared@example.test" });
		await createMember({ email: "shared@example.test" });

		expect(await relinkMemberAccounts()).toEqual({
			success: true,
			linked: 1,
			ambiguous: 2,
			linkedNames: ["Max Muster"],
		});
		expect(await userIdOf(mMax.id)).toBe(max.id);
	});

	test("is refused for non-editors", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["CC-Kasse"] }));
		await createUser({ email: "max@example.test" });
		const m = await createMember({ email: "max@example.test" });

		expect(await relinkMemberAccounts()).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect(await userIdOf(m.id)).toBeNull();
	});
});
