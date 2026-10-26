import { randomUUID } from "node:crypto";
import { rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { tenantAuthConfig, tenants } from "~/server/db/control-schema";
import * as tenantSchema from "~/server/db/schema";
import {
	createDatabase,
	createDatabaseToken,
	deleteDatabase,
} from "~/server/lib/turso-platform";
import { grantSuperAdmin } from "../../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { requireControl } from "../../../../test/state";
import { createTenantAction } from "./tenants";

// The Turso Platform API is replaced by local file databases: "creating" a
// DB hands out a fresh file URL, so migrations and seeding run for real.
vi.mock("~/server/lib/turso-platform", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/server/lib/turso-platform")>();
	return {
		tursoDatabaseNameForSlug: actual.tursoDatabaseNameForSlug,
		createDatabase: vi.fn(),
		createDatabaseToken: vi.fn(),
		deleteDatabase: vi.fn(),
		databaseExists: vi.fn(),
	};
});

setupTestDatabases();

let dbFile: string;

beforeEach(() => {
	dbFile = path.join(os.tmpdir(), `rhenania-provision-${randomUUID()}.db`);
	vi.mocked(createDatabase).mockImplementation(async (name) => ({
		name,
		hostname: `${name}.turso.example`,
		url: `file:${dbFile}`,
	}));
	vi.mocked(createDatabaseToken).mockResolvedValue("jwt-token");
	vi.mocked(deleteDatabase).mockResolvedValue();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	rmSync(dbFile, { force: true });
});

async function signInAsSuperAdmin() {
	await createTenant({ slug: "platform" });
	const operator = await createUser();
	await grantSuperAdmin(operator.id);
	signInAs(operator);
}

function openProvisionedDb() {
	const client = createClient({ url: `file:${dbFile}` });
	return { client, db: drizzle(client, { schema: tenantSchema }) };
}

describe("createTenantAction", () => {
	test("creates the DB, mints a token, migrates, seeds and registers the tenant", async () => {
		await signInAsSuperAdmin();

		const result = await createTenantAction({
			slug: "  Hassia ",
			displayName: "  Corps Hassia ",
		});

		expect(result).toEqual({
			success: true,
			data: { tenantId: expect.any(String), dbUrl: `file:${dbFile}` },
		});
		expect(createDatabase).toHaveBeenCalledWith("corps-hassia");
		expect(createDatabaseToken).toHaveBeenCalledWith("corps-hassia");
		expect(deleteDatabase).not.toHaveBeenCalled();

		const [tenant] = await controlDb()
			.select()
			.from(tenants)
			.where(eq(tenants.slug, "hassia"));
		expect(tenant).toMatchObject({
			id: result.data?.tenantId,
			displayName: "Corps Hassia",
			status: "active",
			dbUrl: `file:${dbFile}`,
			dbAuthToken: "jwt-token",
		});
		const [auth] = await controlDb().select().from(tenantAuthConfig);
		expect(auth).toMatchObject({
			tenantId: tenant?.id,
			emailPasswordEnabled: true,
			microsoftEnabled: false,
		});

		const { client, db } = openProvisionedDb();
		try {
			const roleNames = (await db.select().from(tenantSchema.roles)).map(
				(r) => r.name,
			);
			expect(roleNames).toEqual(
				expect.arrayContaining(["Admin", "Getränkewart", "Fotowart"]),
			);
			expect(await db.select().from(tenantSchema.kasseConfig)).toEqual([
				expect.objectContaining({ id: "singleton", pfandWert: 0 }),
			]);
			expect(await db.select().from(tenantSchema.semesterConfig)).toHaveLength(
				1,
			);
			const sections = await db.select().from(tenantSchema.homepageSections);
			expect(sections.map((s) => s.key).sort()).toEqual([
				"aktive",
				"footer",
				"haus",
				"header",
			]);
			expect(
				(await db.select().from(tenantSchema.kasseTypes)).length,
			).toBeGreaterThan(0);
			expect(
				(await db.select().from(tenantSchema.eventTypes)).length,
			).toBeGreaterThan(0);
			expect(
				(await db.select().from(tenantSchema.memberStatuses)).length,
			).toBeGreaterThan(0);
		} finally {
			client.close();
		}
	});

	test("rejects invalid slugs and blank names before touching Turso", async () => {
		await signInAsSuperAdmin();

		for (const slug of ["ab", "1corps", "corps_x", "a".repeat(32)]) {
			const result = await createTenantAction({ slug, displayName: "X" });
			expect(result.success).toBe(false);
			expect(result.error).toMatch(/^Slug must be 3-31 chars/);
		}
		expect(
			await createTenantAction({ slug: "hassia", displayName: "   " }),
		).toEqual({ success: false, error: "displayName is required." });
		expect(createDatabase).not.toHaveBeenCalled();
	});

	test("rejects slugs that already exist", async () => {
		await signInAsSuperAdmin();

		expect(
			await createTenantAction({ slug: "platform", displayName: "Again" }),
		).toEqual({
			success: false,
			error: "Tenant 'platform' already exists in the control DB.",
		});
		expect(createDatabase).not.toHaveBeenCalled();
	});

	test("rejects slugs whose DB name exceeds Turso's limit", async () => {
		await signInAsSuperAdmin();

		const result = await createTenantAction({
			slug: "a".repeat(30),
			displayName: "Long",
		});

		expect(result.success).toBe(false);
		expect(result.error).toMatch(/produces invalid Turso DB name/);
		expect(createDatabase).not.toHaveBeenCalled();
	});

	test("deletes the new DB when minting the token fails", async () => {
		await signInAsSuperAdmin();
		vi.mocked(createDatabaseToken).mockRejectedValueOnce(
			new Error("Turso API POST /tokens failed: 500"),
		);

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(result).toEqual({
			success: false,
			error: "Turso API POST /tokens failed: 500",
		});
		expect(deleteDatabase).toHaveBeenCalledWith("corps-hassia");
		expect(await controlDb().select().from(tenants)).toHaveLength(1);
	});

	test("deletes the new DB when migrating fails", async () => {
		await signInAsSuperAdmin();
		vi.mocked(createDatabase).mockResolvedValueOnce({
			name: "corps-hassia",
			hostname: "x",
			url: `file:${path.join(os.tmpdir(), randomUUID(), "missing", "db.db")}`,
		});

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(result.success).toBe(false);
		expect(deleteDatabase).toHaveBeenCalledWith("corps-hassia");
		expect(await controlDb().select().from(tenants)).toHaveLength(1);
	});

	test("names the DB for manual cleanup when the rollback fails too", async () => {
		await signInAsSuperAdmin();
		vi.mocked(createDatabaseToken).mockRejectedValueOnce(new Error("token"));
		vi.mocked(deleteDatabase).mockRejectedValueOnce(new Error("delete"));

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(result).toEqual({
			success: false,
			error:
				"Tenant provisioning failed AND rollback failed. Manual cleanup required for Turso DB 'corps-hassia'. Original: token | Rollback: delete",
		});
	});

	test.fails("leaves no tenant row behind when the auth config insert fails (#29)", async () => {
		await signInAsSuperAdmin();
		await requireControl().client.execute(
			"CREATE TRIGGER fail_auth BEFORE INSERT ON control_tenant_auth_config BEGIN SELECT RAISE(ABORT, 'boom'); END",
		);

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(result.success).toBe(false);
		expect(deleteDatabase).toHaveBeenCalledWith("corps-hassia");
		expect(await controlDb().select().from(tenants)).toHaveLength(1);
	});

	test.fails("a new tenant gets the same default roles as initializeRoles (#29)", async () => {
		await signInAsSuperAdmin();

		await createTenantAction({ slug: "hassia", displayName: "Corps Hassia" });

		const { client, db } = openProvisionedDb();
		try {
			const roleNames = (await db.select().from(tenantSchema.roles)).map(
				(r) => r.name,
			);
			expect(roleNames).toContain("AHV 1. Vorstand");
		} finally {
			client.close();
		}
	});
});
