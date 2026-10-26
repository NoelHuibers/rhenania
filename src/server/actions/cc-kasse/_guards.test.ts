import { describe, expect, test } from "vitest";

import { ADRESSLISTE_ROLES, AHV_VORSTAND_ROLES } from "~/lib/roles";
import { etaplans, kostenerstattungen } from "~/server/db/schema";
import {
	createKostenpunkt,
	createReimbursement,
	createEtaplan as seedEtaplan,
} from "../../../../test/factories/cc-kasse";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import {
	BEITRAG_ROLES,
	MEMBER_EDIT_ROLES,
	MEMBER_VIEW_ROLES,
} from "../members/_guards";
import {
	EDIT_ROLES,
	requireAuth,
	requireRoles,
	TREASURY_ROLES,
} from "./_guards";
import { createEtaplan } from "./etaplans";
import { approveReimbursement } from "./kostenerstattungen";

setupTestDatabases();

describe("role constants", () => {
	test("treasury roles are a strict subset of the Etatplan editors", () => {
		expect(EDIT_ROLES).toEqual(["Senior", "CC-Kasse", "Admin"]);
		expect(TREASURY_ROLES).toEqual(["CC-Kasse", "Admin"]);
		for (const r of TREASURY_ROLES) {
			expect(EDIT_ROLES).toContain(r);
		}
		expect(TREASURY_ROLES).not.toContain("Senior");
	});

	test("the Adressliste is open to Admins and the whole AHV board only", () => {
		expect(ADRESSLISTE_ROLES).toEqual([
			"Admin",
			"AHV 1. Vorstand",
			"AHV 2. Vorstand",
			"AHV 3. Vorstand",
		]);
		expect(MEMBER_EDIT_ROLES).toBe(ADRESSLISTE_ROLES);
		expect(MEMBER_VIEW_ROLES).toBe(ADRESSLISTE_ROLES);
		for (const r of AHV_VORSTAND_ROLES) {
			expect(MEMBER_EDIT_ROLES).toContain(r);
		}
		expect(BEITRAG_ROLES).toEqual(["CC-Kasse", "Admin"]);
	});
});

describe("requireAuth", () => {
	test("rejects a missing session", async () => {
		await createTenant();
		expect(await requireAuth()).toEqual({
			ok: false,
			error: "Nicht angemeldet",
		});
	});

	test("returns the signed-in user id", async () => {
		await createTenant();
		const user = await createUser();
		signInAs(user);
		expect(await requireAuth()).toEqual({ ok: true, userId: user.id });
	});
});

describe("requireRoles", () => {
	test("rejects a missing session before looking at roles", async () => {
		await createTenant();
		expect(await requireRoles(EDIT_ROLES)).toEqual({
			ok: false,
			error: "Nicht angemeldet",
		});
	});

	test("rejects members without any of the roles", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		expect(await requireRoles(EDIT_ROLES)).toEqual({
			ok: false,
			error: "Keine Berechtigung",
		});
	});

	test.each([
		["Senior", true, false],
		["CC-Kasse", true, true],
		["Admin", true, true],
		["AHV 1. Vorstand", false, false],
	])("%s: edit=%s treasury=%s", async (role, edit, treasury) => {
		await createTenant();
		const user = await createUser({ roles: [role] });
		signInAs(user);
		expect((await requireRoles(EDIT_ROLES)).ok).toBe(edit);
		expect((await requireRoles(TREASURY_ROLES)).ok).toBe(treasury);
	});

	test("roles held in another tenant do not count", async () => {
		const home = await createTenant();
		const other = await createTenant();
		const user = await createUser({ roles: ["CC-Kasse"], tenantId: home.id });
		signInAs(user);

		expect((await requireRoles(TREASURY_ROLES)).ok).toBe(true);
		switchTenant(other);
		expect((await requireRoles(TREASURY_ROLES)).ok).toBe(false);
	});
});

describe("guards on the actions", () => {
	test("a plain member cannot create an Etatplan", async () => {
		await createTenant();
		signInAs(await createUser());

		const result = await createEtaplan({
			name: "WS 2026",
			semesterType: "WS",
			year: 2026,
		});

		expect(result).toEqual({ success: false, error: "Keine Berechtigung" });
		expect(await tenantDb().select().from(etaplans)).toHaveLength(0);
	});

	test("a Senior may edit the plan but not approve reimbursements", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Senior"] }));
		const plan = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id);
		const request = await createReimbursement(kp);

		const result = await approveReimbursement(request.id);

		expect(result).toEqual({ success: false, error: "Keine Berechtigung" });
		const [row] = await tenantDb().select().from(kostenerstattungen);
		expect(row).toMatchObject({ status: "Eingereicht", approvedBy: null });
	});
});
