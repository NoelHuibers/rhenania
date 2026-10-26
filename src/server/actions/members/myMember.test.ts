import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { members } from "~/server/db/schema";
import { createMember } from "../../../../test/factories/members";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import { getMyMember, updateMyMember } from "./myMember";

setupTestDatabases();

async function memberRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(members)
		.where(eq(members.id, id));
	return row;
}

describe("getMyMember", () => {
	test("returns the member linked to my account", async () => {
		await createTenant();
		const me = await createUser();
		const m = await createMember({ userId: me.id });
		signInAs(me);

		expect((await getMyMember())?.id).toBe(m.id);
	});

	test("links the single unlinked member with my email (case-insensitive)", async () => {
		await createTenant();
		const me = await createUser({ email: "max@example.test" });
		const m = await createMember({ email: "MAX@example.test" });
		signInAs(me);

		expect(await getMyMember()).toMatchObject({ id: m.id, userId: me.id });
		expect((await memberRow(m.id))?.userId).toBe(me.id);
	});

	test("refuses to guess when two members share my email", async () => {
		await createTenant();
		const me = await createUser({ email: "max@example.test" });
		const a = await createMember({ email: "max@example.test" });
		const b = await createMember({ email: "max@example.test" });
		signInAs(me);

		expect(await getMyMember()).toBeNull();
		expect((await memberRow(a.id))?.userId).toBeNull();
		expect((await memberRow(b.id))?.userId).toBeNull();
	});

	test("never resolves or links without an active membership in this tenant", async () => {
		const home = await createTenant();
		const other = await createTenant();
		const me = await createUser({
			email: "max@example.test",
			tenantId: home.id,
		});
		switchTenant(other);
		const foreign = await createMember({ email: "max@example.test" });
		signInAs(me);

		expect(await getMyMember()).toBeNull();
		expect((await memberRow(foreign.id))?.userId).toBeNull();
	});

	test("a suspended membership resolves nothing", async () => {
		await createTenant();
		const me = await createUser({ membership: "suspended" });
		await createMember({ userId: me.id });
		signInAs(me);

		expect(await getMyMember()).toBeNull();
	});

	test("anonymous callers get nothing", async () => {
		await createTenant();
		await createMember();
		expect(await getMyMember()).toBeNull();
	});
});

describe("updateMyMember", () => {
	test("updates my own data but never status or the address flag", async () => {
		await createTenant();
		const me = await createUser();
		const m = await createMember({
			userId: me.id,
			status: "AH",
			addressNeedsUpdate: true,
			lettersOptOut: true,
		});
		signInAs(me);

		const result = await updateMyMember({
			firstName: " Max ",
			lastName: "Muster",
			street: " Hauptstr. ",
			houseNumber: "1",
			postalCode: "70173",
			city: "Stuttgart",
			country: "",
			// Not part of the self-service schema; must be ignored.
			...({ status: "CB", addressNeedsUpdate: false } as object),
		});

		expect(result).toEqual({ success: true });
		expect(await memberRow(m.id)).toMatchObject({
			firstName: "Max",
			street: "Hauptstr.",
			city: "Stuttgart",
			country: "Deutschland",
			status: "AH",
			addressNeedsUpdate: true,
			// Omitted booleans keep their stored value.
			lettersOptOut: true,
			updatedBy: me.id,
		});
	});

	test("explains when no member entry exists", async () => {
		await createTenant();
		signInAs(await createUser());

		const result = await updateMyMember({ firstName: "A", lastName: "B" });

		expect(result.success).toBe(false);
		expect(result.success === false && result.error).toMatch(
			/Kein Mitgliedseintrag/,
		);
	});

	test("rejects a blank name", async () => {
		await createTenant();
		const me = await createUser();
		const m = await createMember({ userId: me.id, lastName: "Bleibt" });
		signInAs(me);

		expect(await updateMyMember({ firstName: "A", lastName: "  " })).toEqual({
			success: false,
			error: "Nachname erforderlich",
		});
		expect((await memberRow(m.id))?.lastName).toBe("Bleibt");
	});
});
