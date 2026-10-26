import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	PROVISIONING_STEPS,
	type ProvisioningStep,
	tenantAuthConfig,
	tenantDomains,
	tenantMemberships,
	tenantProvisioning,
	tenants,
} from "~/server/db/control-schema";
import * as tenantSchema from "~/server/db/schema";
import { resolveTenantByHost } from "~/server/lib/tenant-context";
import { DEFAULT_ROLES } from "~/server/lib/tenant-default-config";
import { seedTenantDefaults } from "~/server/lib/tenant-seed";
import {
	createDatabase,
	createDatabaseToken,
	deleteDatabase,
	getDatabase,
} from "~/server/lib/turso-platform";
import { grantSuperAdmin } from "../../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	type TestUser,
} from "../../../../test/harness";
import { requireControl } from "../../../../test/state";
import {
	abandonTenantProvisioningAction,
	createTenantAction,
	listTenantProvisioningsAction,
	setTenantStatusAction,
} from "./tenants";

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
		getDatabase: vi.fn(),
	};
});

// Real migrations and seeding, but individual calls can be made to fail.
vi.mock("drizzle-orm/libsql/migrator", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("drizzle-orm/libsql/migrator")>();
	return { ...actual, migrate: vi.fn(actual.migrate) };
});
vi.mock("~/server/lib/tenant-seed", async (importOriginal) => {
	const actual =
		await importOriginal<typeof import("~/server/lib/tenant-seed")>();
	return {
		...actual,
		seedTenantDefaults: vi.fn(actual.seedTenantDefaults),
	};
});

setupTestDatabases();

let dbFile: string;

const turso = (name: string, file = dbFile) => ({
	name,
	hostname: `${name}.turso.example`,
	url: `file:${file}`,
});

beforeEach(() => {
	dbFile = path.join(os.tmpdir(), `rhenania-provision-${randomUUID()}.db`);
	vi.mocked(createDatabase).mockImplementation(async (name) => turso(name));
	vi.mocked(getDatabase).mockResolvedValue(null);
	vi.mocked(createDatabaseToken).mockResolvedValue("jwt-token");
	vi.mocked(deleteDatabase).mockResolvedValue();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	rmSync(dbFile, { force: true });
});

async function signInAsSuperAdmin(): Promise<TestUser> {
	await createTenant({ slug: "platform" });
	const operator = await createUser();
	await grantSuperAdmin(operator.id);
	signInAs(operator);
	return operator;
}

function openProvisionedDb() {
	const client = createClient({ url: `file:${dbFile}` });
	return { client, db: drizzle(client, { schema: tenantSchema }) };
}

const tenantBySlug = async (slug: string) =>
	(await controlDb().select().from(tenants).where(eq(tenants.slug, slug)))[0];

const runOf = async (slug: string) =>
	(
		await controlDb()
			.select()
			.from(tenantProvisioning)
			.where(eq(tenantProvisioning.slug, slug))
	)[0];

const sql = (statement: string) => requireControl().client.execute(statement);

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

		const tenant = await tenantBySlug("hassia");
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
		expect(await runOf("hassia")).toMatchObject({
			step: "active",
			tenantId: tenant?.id,
			dbAuthToken: null,
			lastError: null,
			leaseUntil: null,
			attempts: 1,
			completedAt: expect.any(Date),
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

	test("attaches the primary domain and makes the first admin", async () => {
		const operator = await signInAsSuperAdmin();
		const admin = await createUser({ email: "senior@hassia.example" });

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
			primaryHostname: " Hassia.DE ",
			firstAdminEmail: " Senior@Hassia.example ",
		});

		expect(result.success).toBe(true);
		const tenantId = result.data?.tenantId as string;
		expect(await resolveTenantByHost("hassia.de")).toBe(tenantId);
		expect(
			await controlDb()
				.select()
				.from(tenantDomains)
				.where(eq(tenantDomains.tenantId, tenantId)),
		).toEqual([
			expect.objectContaining({
				hostname: "hassia.de",
				isPrimary: true,
				isCustom: true,
				verifiedAt: expect.any(Date),
			}),
		]);
		expect(
			await controlDb()
				.select()
				.from(tenantMemberships)
				.where(eq(tenantMemberships.tenantId, tenantId)),
		).toEqual([
			expect.objectContaining({ userId: admin.id, status: "active" }),
		]);

		const { client, db } = openProvisionedDb();
		try {
			const adminRoles = await db
				.select({ userId: tenantSchema.userRoles.userId })
				.from(tenantSchema.userRoles)
				.innerJoin(
					tenantSchema.roles,
					eq(tenantSchema.userRoles.roleId, tenantSchema.roles.id),
				)
				.where(eq(tenantSchema.roles.name, "Admin"));
			expect(adminRoles).toEqual([{ userId: admin.id }]);
			expect(await db.select().from(tenantSchema.users)).toEqual([
				expect.objectContaining({
					id: admin.id,
					email: "senior@hassia.example",
				}),
			]);
		} finally {
			client.close();
		}
		expect(operator.id).not.toBe(admin.id);
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
		expect(await controlDb().select().from(tenantProvisioning)).toEqual([]);
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

	test("rejects an unknown first admin and a taken hostname before touching Turso", async () => {
		await signInAsSuperAdmin();

		expect(
			await createTenantAction({
				slug: "hassia",
				displayName: "Corps Hassia",
				firstAdminEmail: "nobody@example.test",
			}),
		).toEqual({
			success: false,
			error:
				"No account with email 'nobody@example.test'. The first admin must have signed in once before.",
		});
		expect(
			await createTenantAction({
				slug: "hassia",
				displayName: "Corps Hassia",
				primaryHostname: "platform.test.localhost",
			}),
		).toEqual({
			success: false,
			error: "Hostname already registered to another tenant",
		});
		expect(
			await createTenantAction({
				slug: "hassia",
				displayName: "Corps Hassia",
				primaryHostname: "https://hassia.de",
			}),
		).toEqual({ success: false, error: "Invalid hostname characters" });
		expect(getDatabase).not.toHaveBeenCalled();
		expect(createDatabase).not.toHaveBeenCalled();
		expect(await controlDb().select().from(tenantProvisioning)).toEqual([]);
	});

	test("refuses a second run once the tenant is active", async () => {
		await signInAsSuperAdmin();
		await createTenantAction({ slug: "hassia", displayName: "Corps Hassia" });

		expect(
			await createTenantAction({ slug: "hassia", displayName: "Again" }),
		).toEqual({
			success: false,
			error: "Tenant 'hassia' already exists in the control DB.",
		});
		expect(createDatabase).toHaveBeenCalledTimes(1);
	});

	test("leaves no tenant row behind when the auth config insert fails (#29)", async () => {
		await signInAsSuperAdmin();
		await sql(
			"CREATE TRIGGER fail_auth BEFORE INSERT ON control_tenant_auth_config BEGIN SELECT RAISE(ABORT, 'boom'); END",
		);

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(result.success).toBe(false);
		// The tenant row and auth config are one batch: neither is left over.
		expect(await controlDb().select().from(tenants)).toHaveLength(1);
		// The Turso DB is kept for the resume instead of being deleted; the
		// run records where it stopped (abandoning it deletes the DB).
		expect(deleteDatabase).not.toHaveBeenCalled();
		expect(await runOf("hassia")).toMatchObject({
			step: "seeded",
			tenantId: null,
			dbUrl: `file:${dbFile}`,
		});
	});

	test("a new tenant gets the same default roles as initializeRoles (#29)", async () => {
		await signInAsSuperAdmin();

		await createTenantAction({ slug: "hassia", displayName: "Corps Hassia" });

		const { client, db } = openProvisionedDb();
		try {
			const roleNames = (await db.select().from(tenantSchema.roles)).map(
				(r) => r.name,
			);
			expect(roleNames).toContain("AHV 1. Vorstand");
			expect(roleNames.sort()).toEqual(DEFAULT_ROLES.map((r) => r.name).sort());
		} finally {
			client.close();
		}
	});
});

describe("resuming a failed run (#29)", () => {
	const raiseOn = (name: string, event: string) => async () => {
		await sql(
			`CREATE TRIGGER ${name} ${event} BEGIN SELECT RAISE(ABORT, 'boom'); END`,
		);
		return async () => {
			await sql(`DROP TRIGGER ${name}`);
		};
	};
	const once = (arm: () => void) => async (): Promise<() => Promise<void>> => {
		arm();
		return async () => {};
	};

	const failures: Array<{
		step: ProvisioningStep;
		inject: () => Promise<() => Promise<void>>;
	}> = [
		{
			step: "db_requested",
			inject: once(() =>
				vi.mocked(getDatabase).mockRejectedValueOnce(new Error("turso down")),
			),
		},
		{
			step: "db_created",
			inject: once(() =>
				vi.mocked(createDatabase).mockRejectedValueOnce(new Error("create")),
			),
		},
		{
			step: "token",
			inject: once(() =>
				vi
					.mocked(createDatabaseToken)
					.mockRejectedValueOnce(new Error("Turso API POST /tokens failed")),
			),
		},
		{
			step: "migrated",
			inject: once(() =>
				vi.mocked(migrate).mockRejectedValueOnce(new Error("migrate")),
			),
		},
		{
			step: "seeded",
			inject: once(() =>
				vi.mocked(seedTenantDefaults).mockRejectedValueOnce(new Error("seed")),
			),
		},
		{
			step: "control_rows",
			inject: raiseOn(
				"fail_auth",
				"BEFORE INSERT ON control_tenant_auth_config",
			),
		},
		{
			step: "domain",
			inject: raiseOn("fail_domain", "BEFORE INSERT ON control_tenant_domain"),
		},
		{
			step: "first_admin",
			inject: raiseOn(
				"fail_member",
				"BEFORE INSERT ON control_tenant_membership",
			),
		},
		{
			step: "active",
			inject: raiseOn(
				"fail_activate",
				"BEFORE UPDATE OF status ON control_tenant",
			),
		},
	];
	const indexOf = (step: ProvisioningStep) => PROVISIONING_STEPS.indexOf(step);

	test.each(failures)("fails at $step, keeps its progress and resumes", async ({
		step,
		inject,
	}) => {
		await signInAsSuperAdmin();
		const admin = await createUser({ email: "senior@hassia.example" });
		const input = {
			slug: "hassia",
			displayName: "Corps Hassia",
			primaryHostname: "hassia.de",
			firstAdminEmail: admin.email,
		};
		const undo = await inject();

		const failed = await createTenantAction(input);

		expect(failed.success).toBe(false);
		expect(failed.error).toMatch(
			new RegExp(`^Provisioning 'hassia' stopped at step '${step}': .+`),
		);
		const run = await runOf("hassia");
		expect(run).toMatchObject({
			step: PROVISIONING_STEPS[indexOf(step) - 1],
			lastError: failed.error,
			leaseUntil: null,
			attempts: 1,
		});
		const pending = await tenantBySlug("hassia");
		if (indexOf(step) <= indexOf("control_rows")) {
			expect(pending).toBeUndefined();
		} else {
			expect(pending?.status).toBe("pending");
		}
		expect(deleteDatabase).not.toHaveBeenCalled();
		expect((await listTenantProvisioningsAction()).data).toEqual([
			expect.objectContaining({
				slug: "hassia",
				step: run?.step,
				lastError: failed.error,
				running: false,
			}),
		]);

		await undo();
		const resumed = await createTenantAction(input);

		expect(resumed.success).toBe(true);
		const tenantId = resumed.data?.tenantId as string;
		expect(await tenantBySlug("hassia")).toMatchObject({
			id: tenantId,
			status: "active",
			dbAuthToken: "jwt-token",
		});
		expect(await runOf("hassia")).toMatchObject({
			step: "active",
			attempts: 2,
			lastError: null,
		});
		expect(await resolveTenantByHost("hassia.de")).toBe(tenantId);
		expect(
			await controlDb()
				.select()
				.from(tenantMemberships)
				.where(
					and(
						eq(tenantMemberships.tenantId, tenantId),
						eq(tenantMemberships.userId, admin.id),
					),
				),
		).toHaveLength(1);
		expect(await controlDb().select().from(tenantAuthConfig)).toHaveLength(1);
		const { client, db } = openProvisionedDb();
		try {
			expect(await db.select().from(tenantSchema.roles)).toHaveLength(
				DEFAULT_ROLES.length,
			);
			expect(await db.select().from(tenantSchema.userRoles)).toHaveLength(1);
		} finally {
			client.close();
		}
		// Done work is not redone: one DB, one token (unless that step failed).
		expect(createDatabase).toHaveBeenCalledTimes(step === "db_created" ? 2 : 1);
		expect(createDatabaseToken).toHaveBeenCalledTimes(step === "token" ? 2 : 1);
		await expect(listTenantProvisioningsAction()).resolves.toEqual({
			success: true,
			data: [],
		});
	});

	test("picks up the DB an attempt created before it died", async () => {
		await signInAsSuperAdmin();
		let created = false;
		vi.mocked(createDatabase).mockImplementationOnce(async () => {
			created = true;
			throw new Error("function timed out");
		});
		vi.mocked(getDatabase).mockImplementation(async (name) =>
			created ? turso(name) : null,
		);

		const failed = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});
		expect(failed.error).toMatch(/stopped at step 'db_created'/);
		expect((await runOf("hassia"))?.step).toBe("db_requested");

		const resumed = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(resumed).toMatchObject({
			success: true,
			data: { dbUrl: `file:${dbFile}` },
		});
		expect(createDatabase).toHaveBeenCalledTimes(1);
	});

	test("refuses to adopt a DB it did not create", async () => {
		await signInAsSuperAdmin();
		vi.mocked(getDatabase).mockImplementation(async (name) => turso(name));

		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});

		expect(result.error).toBe(
			"Provisioning 'hassia' stopped at step 'db_requested': Turso DB 'corps-hassia' already exists but was not created by this run. Delete it or pick another slug.. Run it again to resume.",
		);
		expect(createDatabase).not.toHaveBeenCalled();
		expect((await runOf("hassia"))?.step).toBe("requested");
	});

	test("a resumed run picks up corrected inputs for steps not yet done", async () => {
		await signInAsSuperAdmin();
		vi.mocked(createDatabaseToken).mockRejectedValueOnce(new Error("token"));
		await createTenantAction({ slug: "hassia", displayName: "Hassia" });

		await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
			primaryHostname: "hassia.de",
		});

		expect(await tenantBySlug("hassia")).toMatchObject({
			displayName: "Corps Hassia",
		});
		expect(await resolveTenantByHost("hassia.de")).toBe(
			(await tenantBySlug("hassia"))?.id,
		);
	});

	test("a migration that failed on a missing DB works once the DB is there", async () => {
		await signInAsSuperAdmin();
		const dir = path.join(os.tmpdir(), randomUUID());
		dbFile = path.join(dir, "db.db");

		const failed = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});
		expect(failed.error).toMatch(/stopped at step 'migrated'/);

		mkdirSync(dir);
		const resumed = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});
		expect(resumed.success).toBe(true);
		rmSync(dir, { recursive: true, force: true });
	});

	test("two runs for the same slug never overlap", async () => {
		await signInAsSuperAdmin();

		const results = await Promise.all([
			createTenantAction({ slug: "hassia", displayName: "Corps Hassia" }),
			createTenantAction({ slug: "hassia", displayName: "Corps Hassia" }),
		]);

		expect(results.filter((r) => r.success)).toHaveLength(1);
		expect(results.find((r) => !r.success)?.error).toMatch(
			/already running|already exists/,
		);
		expect(createDatabase).toHaveBeenCalledTimes(1);
		expect(await controlDb().select().from(tenants)).toHaveLength(2);
	});
});

describe("abandonTenantProvisioningAction (#29)", () => {
	async function failAtDomain() {
		await sql(
			"CREATE TRIGGER fail_domain BEFORE INSERT ON control_tenant_domain BEGIN SELECT RAISE(ABORT, 'boom'); END",
		);
		const result = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
			primaryHostname: "hassia.de",
		});
		expect(result.success).toBe(false);
		await sql("DROP TRIGGER fail_domain");
		vi.mocked(getDatabase).mockImplementation(async (name) => turso(name));
	}

	test("deletes the Turso DB, the pending tenant and the run", async () => {
		await signInAsSuperAdmin();
		await failAtDomain();
		expect((await tenantBySlug("hassia"))?.status).toBe("pending");

		expect(await abandonTenantProvisioningAction("hassia")).toEqual({
			success: true,
		});

		expect(deleteDatabase).toHaveBeenCalledWith("corps-hassia");
		expect(await tenantBySlug("hassia")).toBeUndefined();
		expect(await runOf("hassia")).toBeUndefined();
		expect(await controlDb().select().from(tenantAuthConfig)).toEqual([]);

		// The slug is free again.
		vi.mocked(getDatabase).mockResolvedValue(null);
		const again = await createTenantAction({
			slug: "hassia",
			displayName: "Corps Hassia",
		});
		expect(again.success).toBe(true);
	});

	test("before the DB was requested there is nothing to delete in Turso", async () => {
		await signInAsSuperAdmin();
		vi.mocked(getDatabase).mockRejectedValueOnce(new Error("turso down"));
		await createTenantAction({ slug: "hassia", displayName: "Corps Hassia" });

		expect(await abandonTenantProvisioningAction("hassia")).toEqual({
			success: true,
		});
		expect(deleteDatabase).not.toHaveBeenCalled();
		expect(await runOf("hassia")).toBeUndefined();
	});

	test("keeps everything when the DB can't be deleted", async () => {
		await signInAsSuperAdmin();
		await failAtDomain();
		vi.mocked(deleteDatabase).mockRejectedValueOnce(new Error("Turso 500"));

		const result = await abandonTenantProvisioningAction("hassia");

		expect(result).toEqual({
			success: false,
			error:
				"Could not delete Turso DB 'corps-hassia': Turso 500. Nothing else was removed; try again or delete it by hand.",
		});
		expect((await tenantBySlug("hassia"))?.status).toBe("pending");
		expect(await runOf("hassia")).toMatchObject({
			lastError: result.error,
			leaseUntil: null,
		});
	});

	test("refuses active tenants and unknown runs", async () => {
		await signInAsSuperAdmin();
		await createTenantAction({ slug: "hassia", displayName: "Corps Hassia" });
		vi.mocked(getDatabase).mockImplementation(async (name) => turso(name));

		expect(await abandonTenantProvisioningAction("hassia")).toEqual({
			success: false,
			error: "Tenant 'hassia' is active; it can't be abandoned.",
		});
		expect(await abandonTenantProvisioningAction("nope")).toEqual({
			success: false,
			error: "No provisioning run for 'nope'.",
		});
		expect(deleteDatabase).not.toHaveBeenCalled();
	});

	test("refuses a pending tenant that was switched to active by hand", async () => {
		await signInAsSuperAdmin();
		await failAtDomain();
		const tenant = await tenantBySlug("hassia");
		await setTenantStatusAction(tenant?.id as string, "active");

		expect(await abandonTenantProvisioningAction("hassia")).toMatchObject({
			success: false,
		});
		expect(deleteDatabase).not.toHaveBeenCalled();
	});
});
