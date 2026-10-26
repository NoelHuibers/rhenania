import { describe, expect, test } from "vitest";

import {
	createTenant,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { requireTenant } from "../../../test/state";
import { controlHealth, EXPECTED_HEADS, tenantsHealth } from "./health";

setupTestDatabases();

describe("health", () => {
	test("knows the migration heads this build expects", () => {
		expect(EXPECTED_HEADS.tenant.tag).toMatch(/^\d{4}_/);
		expect(EXPECTED_HEADS.control.tag).toMatch(/^\d{4}_/);
	});

	test("the control DB answers", async () => {
		expect(await controlHealth()).toMatchObject({ ok: true });
	});

	test("migrated tenants are healthy, a tenant behind the journal drifts", async () => {
		const current = await createTenant({ slug: "aktuell" });
		const behind = await createTenant({ slug: "zurueck" });
		await requireTenant(behind.id).client.execute(
			"DELETE FROM __drizzle_migrations WHERE created_at = (SELECT max(created_at) FROM __drizzle_migrations)",
		);
		void current;
		void tenantDb;

		const results = await tenantsHealth();
		const bySlug = Object.fromEntries(results.map((r) => [r.slug, r]));
		expect(bySlug.aktuell).toMatchObject({
			ok: true,
			drift: false,
			head: EXPECTED_HEADS.tenant.tag,
		});
		expect(bySlug.zurueck).toMatchObject({ ok: true, drift: true });
	});

	test("an unreachable tenant DB is reported, not thrown", async () => {
		const t = await createTenant({ slug: "weg" });
		requireTenant(t.id).close();
		const { controlDb } = await import("../../../test/harness");
		const { tenants } = await import("~/server/db/control-schema");
		const { eq } = await import("drizzle-orm");
		await controlDb()
			.update(tenants)
			.set({ dbUrl: "file:/nonexistent-dir/x.db" })
			.where(eq(tenants.id, t.id));

		const [result] = await tenantsHealth();
		expect(result).toMatchObject({ slug: "weg", ok: false, drift: true });
	});
});
