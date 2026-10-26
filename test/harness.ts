// Test harness: fresh databases per test plus factories for the common
// fixtures (tenants, users with roles, drinks, feature flags, sessions).
//
//   setupTestDatabases();
//   const tenant = await createTenant();
//   const user = await createUser({ roles: ["Getränkewart"] });
//   signInAs(user);

import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach } from "vitest";

import type { FeatureKey } from "~/lib/features";
import {
	users as controlUsers,
	tenantDomains,
	tenantFeatures,
	tenantMemberships,
	tenants,
} from "~/server/db/control-schema";
import {
	drinks,
	kasseConfig,
	roles,
	userRoles,
	users,
} from "~/server/db/schema";
import { clearTenantCache } from "~/server/lib/tenant-context";
import { createControlTestDb, createTenantTestDb } from "./db";
import {
	requireControl,
	requireTenant,
	type TestSessionUser,
	testState,
} from "./state";

/** Gives every test in the file its own control DB and resets request state. */
export function setupTestDatabases() {
	beforeEach(() => {
		testState.control = createControlTestDb();
	});
	afterEach(() => {
		for (const tenant of testState.tenants.values()) {
			tenant.close();
		}
		testState.tenants.clear();
		testState.tenantHosts.clear();
		testState.control?.close();
		testState.control = null;
		testState.tenantId = null;
		testState.sessionUser = null;
		testState.headers = {};
		testState.afterTasks = [];
	});
}

let counter = 0;
const next = () => ++counter;

export type TestTenant = { id: string; slug: string; displayName: string };

/**
 * Creates a tenant (control row + domain + its own tenant DB). The first
 * tenant created in a test becomes the tenant of the simulated request.
 */
export async function createTenant(
	opts: {
		slug?: string;
		displayName?: string;
		status?: "active" | "suspended" | "pending";
		features?: FeatureKey[];
	} = {},
): Promise<TestTenant> {
	const n = next();
	const id = randomUUID();
	const slug = opts.slug ?? `corps-${n}`;
	const displayName = opts.displayName ?? `Corps Test ${n}`;
	const tenantDb = createTenantTestDb();
	const control = requireControl().db;

	await control.insert(tenants).values({
		id,
		slug,
		displayName,
		status: opts.status ?? "active",
		dbUrl: tenantDb.url,
	});
	await control.insert(tenantDomains).values({
		tenantId: id,
		hostname: `${slug}.test.localhost`,
		isPrimary: true,
	});
	for (const key of opts.features ?? []) {
		await control
			.insert(tenantFeatures)
			.values({ tenantId: id, key, enabled: true });
	}

	testState.tenants.set(id, tenantDb);
	testState.tenantHosts.set(id, `${slug}.test.localhost`);
	testState.tenantId ??= id;
	return { id, slug, displayName };
}

/** Switches the simulated request to another tenant (host). */
export function switchTenant(tenant: TestTenant | string) {
	testState.tenantId = typeof tenant === "string" ? tenant : tenant.id;
}

export async function setFeature(
	key: FeatureKey,
	enabled: boolean,
	tenantId = testState.tenantId,
) {
	if (!tenantId) {
		throw new Error("No tenant");
	}
	await requireControl()
		.db.insert(tenantFeatures)
		.values({ tenantId, key, enabled })
		.onConflictDoUpdate({
			target: [tenantFeatures.tenantId, tenantFeatures.key],
			set: { enabled },
		});
	clearTenantCache(tenantId);
}

export async function ensureRole(name: string, tenantId = testState.tenantId) {
	const db = requireTenant(tenantId).db;
	const [existing] = await db
		.select({ id: roles.id })
		.from(roles)
		.where(eq(roles.name, name))
		.limit(1);
	if (existing) {
		return existing.id;
	}
	const [created] = await db
		.insert(roles)
		.values({ name })
		.returning({ id: roles.id });
	if (!created) {
		throw new Error(`Could not create role ${name}`);
	}
	return created.id;
}

export type TestUser = TestSessionUser;

/**
 * Creates a global identity (control DB), a membership in the tenant and the
 * tenant-side user mirror, then assigns the given role names.
 */
export async function createUser(
	opts: {
		name?: string;
		email?: string;
		roles?: string[];
		tenantId?: string | null;
		membership?: "active" | "suspended" | "pending" | null;
	} = {},
): Promise<TestUser> {
	const n = next();
	const user: TestUser = {
		id: randomUUID(),
		name: opts.name ?? `Test User ${n}`,
		email: opts.email ?? `user${n}@example.test`,
		image: null,
	};
	await requireControl()
		.db.insert(controlUsers)
		.values({ ...user, emailVerified: true });

	const tenantId =
		opts.tenantId === undefined ? testState.tenantId : opts.tenantId;
	if (tenantId) {
		const membership =
			opts.membership === undefined ? "active" : opts.membership;
		if (membership) {
			await requireControl()
				.db.insert(tenantMemberships)
				.values({ userId: user.id, tenantId, status: membership });
		}
		const tdb = requireTenant(tenantId).db;
		await tdb.insert(users).values({ ...user, emailVerified: true });
		for (const role of opts.roles ?? []) {
			const roleId = await ensureRole(role, tenantId);
			await tdb.insert(userRoles).values({ userId: user.id, roleId });
		}
	}
	return user;
}

export function signInAs(user: TestUser) {
	testState.sessionUser = user;
}

export function signOut() {
	testState.sessionUser = null;
}

export async function createDrink(
	opts: { name?: string; price?: number; available?: boolean } = {},
	tenantId = testState.tenantId,
) {
	const [drink] = await requireTenant(tenantId)
		.db.insert(drinks)
		.values({
			name: opts.name ?? `Drink ${next()}`,
			price: opts.price ?? 1.5,
			isCurrentlyAvailable: opts.available ?? true,
		})
		.returning();
	if (!drink) {
		throw new Error("Could not create drink");
	}
	return drink;
}

export async function setKasseConfig(
	values: Partial<typeof kasseConfig.$inferInsert>,
	tenantId = testState.tenantId,
) {
	await requireTenant(tenantId)
		.db.insert(kasseConfig)
		.values({ id: "singleton", ...values })
		.onConflictDoUpdate({ target: kasseConfig.id, set: values });
}

/** Waits for everything `after()` scheduled so far. */
export async function flushAfter() {
	const tasks = testState.afterTasks.splice(0);
	await Promise.all(tasks);
}

/**
 * Runs `change` right before the next "write" batch reaches the current
 * tenant DB, e.g. to change data between a billing run's read and its write.
 */
export function beforeNextWriteBatch(change: () => Promise<unknown>) {
	const tenant = requireTenant();
	const original = tenant.client;
	tenant.client = new Proxy(original, {
		get(target, prop) {
			if (prop === "batch") {
				return async (...args: Parameters<Client["batch"]>) => {
					if (args[1] === "write") {
						tenant.client = original;
						await change();
					}
					return target.batch(...args);
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** Direct handle on the current tenant DB for assertions. */
export function tenantDb(tenantId = testState.tenantId) {
	return requireTenant(tenantId).db;
}

export function controlDb() {
	return requireControl().db;
}

export { countQueries } from "./query-count";
