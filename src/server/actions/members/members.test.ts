import { eq } from "drizzle-orm";
import { describe, expect, test } from "vitest";

import { members, semesterbeitragCharges } from "~/server/db/schema";
import {
	createEtaplan,
	createKostenpunkt,
} from "../../../../test/factories/cc-kasse";
import {
	createBeitragRun,
	createCharge,
	createMember as seedMember,
	setMemberStatuses,
} from "../../../../test/factories/members";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
	tenantDb,
} from "../../../../test/harness";
import {
	createMember,
	deleteMember,
	listMemberStatusOptions,
	listMembers,
	setAddressNeedsUpdate,
	updateMember,
	updateMemberFields,
} from "./members";

setupTestDatabases();

async function signInEditor(role = "AHV 1. Vorstand"): Promise<TestUser> {
	await createTenant();
	const user = await createUser({ roles: [role] });
	signInAs(user);
	return user;
}

async function memberRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(members)
		.where(eq(members.id, id));
	return row;
}

describe("listMembers", () => {
	test("sorts by name and derives beitragspflichtig and linked", async () => {
		await signInEditor();
		const account = await createUser();
		await seedMember({ firstName: "Zoe", lastName: "Alt", status: "AH idC" });
		await seedMember({
			firstName: "Anton",
			lastName: "Bauer",
			status: "iaCBoB",
			userId: account.id,
		});
		await seedMember({ firstName: "Adam", lastName: "Alt", status: "Fuchs" });

		const list = await listMembers();

		expect(
			list.map((m) => [m.lastName, m.firstName, m.beitragspflichtig, m.linked]),
		).toEqual([
			["Alt", "Adam", true, false],
			["Alt", "Zoe", false, false],
			["Bauer", "Anton", true, true],
		]);
	});

	test("uses the tenant's own status taxonomy", async () => {
		await signInEditor();
		await setMemberStatuses([
			{ key: "Renonce", beitragspflichtig: true },
			{ key: "CB", beitragspflichtig: false },
		]);
		await seedMember({ status: "Renonce" });
		await seedMember({ status: "CB" });

		const list = await listMembers();

		expect(
			Object.fromEntries(list.map((m) => [m.status, m.beitragspflichtig])),
		).toEqual({ Renonce: true, CB: false });
		expect(await listMemberStatusOptions()).toEqual([
			{ value: "Renonce", label: "Renonce" },
			{ value: "CB", label: "CB" },
		]);
	});

	test("every AHV board member and Admins may view; the CC-Kasse may not", async () => {
		await createTenant();
		await seedMember();
		for (const role of ["Admin", "AHV 2. Vorstand", "AHV 3. Vorstand"]) {
			signInAs(await createUser({ roles: [role] }));
			expect(await listMembers()).toHaveLength(1);
		}
		signInAs(await createUser({ roles: ["CC-Kasse"] }));
		expect(await listMembers()).toEqual([]);
		expect(await listMemberStatusOptions()).toEqual([]);
	});
});

describe("createMember", () => {
	test("normalizes status, trims text and defaults the country", async () => {
		const editor = await signInEditor();

		const result = await createMember({
			status: "fux",
			firstName: "  Max ",
			lastName: " Muster ",
			email: "  ",
			city: " Stuttgart ",
			country: "",
		});

		expect(result).toMatchObject({ success: true, linkedNow: false });
		const row = await memberRow(
			result.success && result.data ? result.data.id : "",
		);
		expect(row).toMatchObject({
			status: "Fuchs",
			firstName: "Max",
			lastName: "Muster",
			email: null,
			city: "Stuttgart",
			country: "Deutschland",
			forwarding: false,
			lettersOptOut: false,
			addressNeedsUpdate: false,
			userId: null,
			createdBy: editor.id,
			updatedBy: editor.id,
		});
	});

	test("links an existing account whose email matches", async () => {
		await signInEditor();
		const account = await createUser({ email: "max@example.test" });

		const result = await createMember({
			status: "CB",
			firstName: "Max",
			lastName: "Muster",
			email2: "MAX@example.test",
		});

		expect(result).toMatchObject({ success: true, linkedNow: true });
		const row = await memberRow(
			result.success && result.data ? result.data.id : "",
		);
		expect(row?.userId).toBe(account.id);
	});

	test.each([
		[{ firstName: " " }, "Vorname erforderlich"],
		[{ lastName: "" }, "Nachname erforderlich"],
		[{ status: "" }, "Status erforderlich"],
	])("rejects %o", async (patch, error) => {
		await signInEditor();

		const result = await createMember({
			status: "CB",
			firstName: "A",
			lastName: "B",
			...patch,
		});

		expect(result).toEqual({ success: false, error });
		expect(await tenantDb().select().from(members)).toHaveLength(0);
	});

	test("the CC-Kasse cannot create members", async () => {
		await signInEditor("CC-Kasse");
		expect(
			await createMember({ status: "CB", firstName: "A", lastName: "B" }),
		).toEqual({ success: false, error: "Keine Berechtigung" });
		expect(await tenantDb().select().from(members)).toHaveLength(0);
	});
});

describe("updateMember", () => {
	test("replaces the record and links once the email matches an account", async () => {
		const editor = await signInEditor();
		const account = await createUser({ email: "neu@example.test" });
		const m = await seedMember({ email: "alt@example.test", notes: "alt" });

		const result = await updateMember(m.id, {
			status: "ah",
			firstName: "Neu",
			lastName: "Name",
			email: "neu@example.test",
		});

		expect(result).toMatchObject({ success: true, linkedNow: true });
		expect(await memberRow(m.id)).toMatchObject({
			status: "AH",
			firstName: "Neu",
			email: "neu@example.test",
			notes: null,
			userId: account.id,
			updatedBy: editor.id,
		});
	});

	test("does not touch an existing link", async () => {
		await signInEditor();
		const linked = await createUser();
		await createUser({ email: "other@example.test" });
		const m = await seedMember({ userId: linked.id });

		const result = await updateMember(m.id, {
			status: "CB",
			firstName: "A",
			lastName: "B",
			email: "other@example.test",
		});

		expect(result).toMatchObject({ success: true, linkedNow: false });
		expect((await memberRow(m.id))?.userId).toBe(linked.id);
	});

	test("reports an unknown member", async () => {
		await signInEditor();
		expect(
			await updateMember("missing", {
				status: "CB",
				firstName: "A",
				lastName: "B",
			}),
		).toEqual({ success: false, error: "Mitglied nicht gefunden" });
	});
});

describe("updateMemberFields", () => {
	test("patches single cells: trims, nulls cleared optional fields, normalizes status", async () => {
		const editor = await signInEditor();
		const m = await seedMember({
			firstName: "Max",
			city: "Stuttgart",
			forwarding: false,
		});

		const result = await updateMemberFields(m.id, {
			lastName: "  Neu ",
			city: "  ",
			status: "iacb",
			forwarding: true,
		});

		expect(result).toEqual({ success: true, linkedNow: false });
		expect(await memberRow(m.id)).toMatchObject({
			firstName: "Max",
			lastName: "Neu",
			city: null,
			status: "IaCB",
			forwarding: true,
			updatedBy: editor.id,
		});
	});

	test("blanking a required field is rejected and changes nothing", async () => {
		await signInEditor();
		const m = await seedMember({ lastName: "Bleibt", city: "Stuttgart" });

		expect(
			await updateMemberFields(m.id, { lastName: " ", city: "Berlin" }),
		).toEqual({ success: false, error: "Nachname erforderlich" });
		expect(await memberRow(m.id)).toMatchObject({
			lastName: "Bleibt",
			city: "Stuttgart",
		});
	});

	test("an empty patch is 'no changes'", async () => {
		await signInEditor();
		const m = await seedMember();

		expect(await updateMemberFields(m.id, {})).toEqual({
			success: false,
			error: "Keine Änderungen",
		});
	});

	test("rejects invalid values", async () => {
		await signInEditor();
		const m = await seedMember();

		const result = await updateMemberFields(m.id, {
			postalCode: "1".repeat(21),
		});

		expect(result.success).toBe(false);
		expect((await memberRow(m.id))?.postalCode).toBeNull();
	});

	test("changing an email links a matching account", async () => {
		await signInEditor();
		const account = await createUser({ email: "max@example.test" });
		const m = await seedMember();

		expect(
			await updateMemberFields(m.id, { email3: "max@example.test" }),
		).toEqual({ success: true, linkedNow: true });
		expect((await memberRow(m.id))?.userId).toBe(account.id);
	});
});

describe("setAddressNeedsUpdate / deleteMember", () => {
	test("flags an outdated address", async () => {
		const editor = await signInEditor();
		const m = await seedMember();

		await setAddressNeedsUpdate(m.id, true);

		expect(await memberRow(m.id)).toMatchObject({
			addressNeedsUpdate: true,
			updatedBy: editor.id,
		});
	});

	test("deleting removes open charges with the member", async () => {
		await signInEditor();
		const kp = await createKostenpunkt((await createEtaplan()).id);
		const run = await createBeitragRun(kp);
		const m = await seedMember();
		await createCharge(run.id, m, { status: "Gemahnt" });

		expect(await deleteMember(m.id)).toEqual({ success: true });

		expect(await memberRow(m.id)).toBeUndefined();
		expect(await tenantDb().select().from(semesterbeitragCharges)).toHaveLength(
			0,
		);
	});

	test("a member with paid Beiträge cannot be deleted", async () => {
		await signInEditor();
		const kp = await createKostenpunkt((await createEtaplan()).id);
		const run = await createBeitragRun(kp);
		const m = await seedMember();
		await createCharge(run.id, m, { status: "Bezahlt" });

		expect(await deleteMember(m.id)).toEqual({
			success: false,
			error: "Mitglied hat bezahlte Beiträge und kann nicht gelöscht werden.",
		});
		expect(await memberRow(m.id)).toBeDefined();
	});
});
