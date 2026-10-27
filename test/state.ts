// Mutable state the module mocks in `test/setup.ts` read from: which tenant
// the "request" belongs to, who is signed in, and the databases behind them.

import type { ControlTestDb, TenantTestDb } from "./db";

export type TestSessionUser = {
	id: string;
	email: string;
	name: string | null;
	image: string | null;
};

export const testState: {
	control: ControlTestDb | null;
	tenants: Map<string, TenantTestDb>;
	/** Primary host per tenant; the request host follows the current tenant. */
	tenantHosts: Map<string, string>;
	/** Tenant of the simulated request (`x-tenant-id`). */
	tenantId: string | null;
	/** Signed-in user of the simulated request. */
	sessionUser: TestSessionUser | null;
	/** Extra request headers, e.g. `host`. */
	headers: Record<string, string>;
	/** What `after()` scheduled during the test (see `flushAfter()`). */
	afterTasks: Promise<unknown>[];
} = {
	control: null,
	tenants: new Map(),
	tenantHosts: new Map(),
	tenantId: null,
	sessionUser: null,
	headers: {},
	afterTasks: [],
};

export function requireControl(): ControlTestDb {
	if (!testState.control) {
		throw new Error(
			"No control test DB. Call setupTestDatabases() in the test file.",
		);
	}
	return testState.control;
}

export function requireTenant(tenantId = testState.tenantId): TenantTestDb {
	const tenant = tenantId ? testState.tenants.get(tenantId) : undefined;
	if (!tenant) {
		throw new Error(
			`No tenant test DB for ${tenantId ?? "(no tenant in request)"}.`,
		);
	}
	return tenant;
}
