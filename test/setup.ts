// Global test setup: a hard guard against touching anything but local test
// databases, plus module doubles for the Next.js request APIs, the DB
// clients and the session. Real domain code (server actions, tenant
// context, feature flags) runs unchanged against fresh libSQL file DBs.

import { afterEach, vi } from "vitest";

// ─── Production guard ───────────────────────────────────────────────────────
const REMOTE = /(libsql|https?|wss?):\/\//i;
for (const key of ["DATABASE_URL", "CONTROL_DATABASE_URL"]) {
	const value = process.env[key] ?? "";
	if (!value.startsWith("file:") || REMOTE.test(value)) {
		throw new Error(
			`Refusing to run tests: ${key} is not a local file: URL. Tests must never reach a remote database.`,
		);
	}
}
for (const key of [
	"DATABASE_AUTH_TOKEN",
	"CONTROL_DATABASE_AUTH_TOKEN",
	"TURSO_PLATFORM_TOKEN",
	"BLOB_READ_WRITE_TOKEN",
	"GMAIL_PASSWORD",
]) {
	if (process.env[key]) {
		throw new Error(`Refusing to run tests: ${key} is set.`);
	}
}

// ─── Helpers ────────────────────────────────────────────────────────────────
/** Object whose every property is read from `resolve()` at call time. */
function lazy<T extends object>(resolve: () => T): T {
	return new Proxy({} as T, {
		get(_target, prop) {
			const real = resolve() as Record<PropertyKey, unknown>;
			const value = real[prop];
			return typeof value === "function" ? value.bind(real) : value;
		},
	});
}

// ─── next/* ─────────────────────────────────────────────────────────────────
vi.mock("next/headers", async () => {
	const { testState } = await import("./state");
	const buildHeaders = () => {
		const h = new Headers({ host: "test.localhost", ...testState.headers });
		if (testState.tenantId) {
			h.set("x-tenant-id", testState.tenantId);
		}
		return h;
	};
	const cookieJar = new Map<string, string>();
	return {
		headers: async () => buildHeaders(),
		cookies: async () => ({
			get: (name: string) =>
				cookieJar.has(name)
					? { name, value: cookieJar.get(name) as string }
					: undefined,
			getAll: () =>
				[...cookieJar.entries()].map(([name, value]) => ({ name, value })),
			has: (name: string) => cookieJar.has(name),
			set: (name: string, value: string) => void cookieJar.set(name, value),
			delete: (name: string) => void cookieJar.delete(name),
		}),
	};
});

vi.mock("next/cache", () => ({
	revalidatePath: vi.fn(),
	revalidateTag: vi.fn(),
	unstable_cache: <T>(fn: T) => fn,
}));

// `after()` needs a Next.js request scope: start the task right away and keep
// its promise so a test can await it with `flushAfter()`. Test files that
// mock `next/server` themselves take precedence.
vi.mock("next/server", async (importOriginal) => {
	const { testState } = await import("./state");
	return {
		...(await importOriginal<typeof import("next/server")>()),
		after: (task: (() => unknown) | Promise<unknown>) => {
			testState.afterTasks.push(
				Promise.resolve(typeof task === "function" ? task() : task),
			);
		},
	};
});

// ─── Databases ──────────────────────────────────────────────────────────────
vi.mock("~/server/db", async () => {
	const { requireTenant } = await import("./state");
	return {
		db: lazy(() => requireTenant().db),
		client: lazy(() => requireTenant().client),
		fallbackClient: lazy(() => requireTenant().client),
	};
});

vi.mock("~/server/db/control", async () => {
	const { requireControl } = await import("./state");
	return {
		controlDb: lazy(() => requireControl().db),
		controlClient: lazy(() => requireControl().client),
	};
});

vi.mock("~/server/db/tenants", async () => {
	const { requireTenant, testState } = await import("./state");
	class TenantNotFoundError extends Error {
		constructor(tenantId: string) {
			super(`Tenant not found: ${tenantId}`);
			this.name = "TenantNotFoundError";
		}
	}
	const get = (tenantId: string) => {
		if (!testState.tenants.has(tenantId)) {
			throw new TenantNotFoundError(tenantId);
		}
		return requireTenant(tenantId);
	};
	return {
		TenantNotFoundError,
		getTenantDb: async (tenantId: string) => get(tenantId).db,
		getCurrentTenantDb: async () => {
			if (!testState.tenantId) {
				throw new Error(
					"No tenant in request context. Did the request bypass middleware?",
				);
			}
			return get(testState.tenantId).db;
		},
		getTenantClient: async (tenantId: string) => get(tenantId).client,
		clearTenantDbCache: () => {},
	};
});

// ─── Session ────────────────────────────────────────────────────────────────
// Same contract as the real `auth()` in `src/server/auth/index.ts`: roles are
// only attached for an ACTIVE membership in the current tenant.
vi.mock("~/server/auth", async () => {
	const { and, eq } = await import("drizzle-orm");
	const { tenantMemberships } = await import("~/server/db/control-schema");
	const { roles, userRoles } = await import("~/server/db/schema");
	const { requireControl, requireTenant, testState } = await import("./state");

	async function auth() {
		const user = testState.sessionUser;
		if (!user) {
			return null;
		}
		let roleNames: string[] = [];
		const tenantId = testState.tenantId;
		if (tenantId) {
			const [membership] = await requireControl()
				.db.select({ status: tenantMemberships.status })
				.from(tenantMemberships)
				.where(
					and(
						eq(tenantMemberships.userId, user.id),
						eq(tenantMemberships.tenantId, tenantId),
					),
				)
				.limit(1);
			if (membership?.status === "active") {
				const rows = await requireTenant(tenantId)
					.db.select({ roleName: roles.name })
					.from(userRoles)
					.innerJoin(roles, eq(userRoles.roleId, roles.id))
					.where(eq(userRoles.userId, user.id));
				roleNames = rows.map((r) => r.roleName);
			}
		}
		return { user: { ...user, roles: roleNames } };
	}

	const betterAuthInstance = {
		api: {
			getSession: async () => {
				const user = testState.sessionUser;
				return user
					? { user, session: { id: `session-${user.id}`, userId: user.id } }
					: null;
			},
		},
	};

	return { auth, betterAuthInstance };
});

// ─── Isolation between tests ────────────────────────────────────────────────
afterEach(async () => {
	const { clearTenantCache, clearTenantHostCache } = await import(
		"~/server/lib/tenant-context"
	);
	clearTenantCache();
	clearTenantHostCache();
});
