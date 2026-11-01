import { describe, expect, test } from "vitest";

import { ADRESSLISTE_ROLES, AHV_VORSTAND_ROLES } from "~/lib/roles";
import { etaplans, kostenerstattungen } from "~/server/db/schema";
import { ROLES, requireCaller } from "~/server/lib/authz";
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
import { approveReimbursement, createEtaplan } from "./actions";

setupTestDatabases();

describe("role constants", () => {
	test("treasury roles are a strict subset of the Etatplan editors", () => {
		expect(ROLES.etatplan).toEqual(["Senior", "CC-Kasse", "Admin"]);
		expect(ROLES.ccKasse).toEqual(["CC-Kasse", "Admin"]);
		for (const r of ROLES.ccKasse) {
			expect(ROLES.etatplan).toContain(r);
		}
		expect(ROLES.ccKasse).not.toContain("Senior");
	});

	test("the Adressliste is open to Admins and the whole AHV board only", () => {
		expect(ADRESSLISTE_ROLES).toEqual([
			"Admin",
			"AHV 1. Vorstand",
			"AHV 2. Vorstand",
			"AHV 3. Vorstand",
		]);
		expect(ROLES.adressliste).toBe(ADRESSLISTE_ROLES);
		for (const r of AHV_VORSTAND_ROLES) {
			expect(ROLES.adressliste).toContain(r);
		}
	});
});

describe("requireCaller with the CC-Kasse roles", () => {
	test("rejects a missing session", async () => {
		await createTenant();
		await expect(requireCaller()).rejects.toThrow("Nicht angemeldet");
	});

	test("returns the signed-in member and their tenant", async () => {
		const tenant = await createTenant();
		const user = await createUser();
		signInAs(user);
		expect(await requireCaller()).toMatchObject({
			member: { id: user.id },
			tenantId: tenant.id,
		});
	});

	test("rejects a missing session before looking at roles", async () => {
		await createTenant();
		await expect(requireCaller(ROLES.etatplan)).rejects.toThrow(
			"Nicht angemeldet",
		);
	});

	test("rejects members without any of the roles", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		await expect(requireCaller(ROLES.etatplan)).rejects.toThrow(
			"Keine Berechtigung",
		);
	});

	const allowed = (roles: readonly string[]) =>
		requireCaller(roles).then(
			() => true,
			() => false,
		);

	test.each([
		["Senior", true, false],
		["CC-Kasse", true, true],
		["Admin", true, true],
		["AHV 1. Vorstand", false, false],
	])("%s: edit=%s treasury=%s", async (role, edit, treasury) => {
		await createTenant();
		const user = await createUser({ roles: [role] });
		signInAs(user);
		expect(await allowed(ROLES.etatplan)).toBe(edit);
		expect(await allowed(ROLES.ccKasse)).toBe(treasury);
	});

	test("roles held in another tenant do not count", async () => {
		const home = await createTenant();
		const other = await createTenant();
		const user = await createUser({ roles: ["CC-Kasse"], tenantId: home.id });
		signInAs(user);

		expect(await allowed(ROLES.ccKasse)).toBe(true);
		switchTenant(other);
		expect(await allowed(ROLES.ccKasse)).toBe(false);
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

		expect(result).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
		expect(await tenantDb().select().from(etaplans)).toHaveLength(0);
	});

	test("a Senior may edit the plan but not approve reimbursements", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Senior"] }));
		const plan = await seedEtaplan();
		const kp = await createKostenpunkt(plan.id);
		const request = await createReimbursement(kp);

		const result = await approveReimbursement(request.id);

		expect(result).toEqual({
			ok: false,
			error: "Keine Berechtigung",
			code: "FORBIDDEN",
		});
		const [row] = await tenantDb().select().from(kostenerstattungen);
		expect(row).toMatchObject({ status: "Eingereicht", approvedBy: null });
	});
});
