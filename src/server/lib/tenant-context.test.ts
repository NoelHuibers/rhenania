import { eq } from "drizzle-orm";
import * as nextHeaders from "next/headers";
import { afterEach, describe, expect, test, vi } from "vitest";

import { defaultFeatureFlags } from "~/lib/features";
import { tenantMemberships, tenants } from "~/server/db/control-schema";
import { addDomain } from "../../../test/factories/platform";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	switchTenant,
} from "../../../test/harness";
import { requireControl, testState } from "../../../test/state";
import {
	clearTenantCache,
	clearTenantHostCache,
	getCurrentRequestOrigin,
	getCurrentTenant,
	getTenantById,
	getTenantId,
	hasActiveMembership,
	requireCurrentTenant,
	requireTenantId,
	resolveTenantByHost,
} from "./tenant-context";

setupTestDatabases();

afterEach(() => {
	vi.useRealTimers();
});

describe("resolveTenantByHost", () => {
	test("ignores port, case and surrounding whitespace", async () => {
		const tenant = await createTenant({ slug: "hassia" });

		expect(await resolveTenantByHost("hassia.test.localhost")).toBe(tenant.id);
		expect(await resolveTenantByHost("HASSIA.Test.LocalHost:3000")).toBe(
			tenant.id,
		);
		expect(await resolveTenantByHost("  hassia.test.localhost  ")).toBe(
			tenant.id,
		);
	});

	test("returns null for unknown, empty and missing hosts", async () => {
		await createTenant();

		expect(await resolveTenantByHost("unknown.example")).toBeNull();
		expect(await resolveTenantByHost("")).toBeNull();
		expect(await resolveTenantByHost(":3000")).toBeNull();
		expect(await resolveTenantByHost(null)).toBeNull();
		expect(await resolveTenantByHost(undefined)).toBeNull();
	});

	test("resolves every domain of a tenant", async () => {
		const tenant = await createTenant({ slug: "rhenania" });
		await addDomain(tenant.id, "www.rhenania.example");

		expect(await resolveTenantByHost("www.rhenania.example")).toBe(tenant.id);
	});

	test("suspended tenants do not resolve, pending ones do", async () => {
		await createTenant({ slug: "gone", status: "suspended" });
		const pending = await createTenant({ slug: "new", status: "pending" });

		expect(await resolveTenantByHost("gone.test.localhost")).toBeNull();
		expect(await resolveTenantByHost("new.test.localhost")).toBe(pending.id);
	});

	// Superadmin writes bump the config version and are seen within seconds
	// (tenant-config.test.ts); a minute is the bound for writes that don't.
	test("caches lookups for a minute, including misses", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
		const tenant = await createTenant({ slug: "hassia" });

		expect(await resolveTenantByHost("hassia.example")).toBeNull();
		await addDomain(tenant.id, "hassia.example");

		vi.setSystemTime(new Date("2026-10-26T12:00:59Z"));
		expect(await resolveTenantByHost("hassia.example")).toBeNull();

		vi.setSystemTime(new Date("2026-10-26T12:01:01Z"));
		expect(await resolveTenantByHost("hassia.example")).toBe(tenant.id);
	});

	test("clearTenantHostCache forces a fresh lookup", async () => {
		const tenant = await createTenant({ slug: "hassia" });
		expect(await resolveTenantByHost("hassia.test.localhost")).toBe(tenant.id);

		await controlDb()
			.update(tenants)
			.set({ status: "suspended" })
			.where(eq(tenants.id, tenant.id));
		expect(await resolveTenantByHost("hassia.test.localhost")).toBe(tenant.id);

		clearTenantHostCache();
		expect(await resolveTenantByHost("hassia.test.localhost")).toBeNull();
	});
});

describe("request tenant", () => {
	test("getTenantId reads the tenant header set by the proxy", async () => {
		const a = await createTenant();
		const b = await createTenant();

		expect(await getTenantId()).toBe(a.id);
		switchTenant(b);
		expect(await requireTenantId()).toBe(b.id);
	});

	test("requireTenantId and requireCurrentTenant throw without a tenant", async () => {
		expect(await getTenantId()).toBeNull();
		expect(await getCurrentTenant()).toBeNull();
		await expect(requireTenantId()).rejects.toThrow(/No tenant in request/);
		await expect(requireCurrentTenant()).rejects.toThrow(
			/No tenant in request/,
		);
	});

	test("getCurrentTenant returns slug, name, branding and flags", async () => {
		const tenant = await createTenant({
			slug: "hassia",
			displayName: "Corps Hassia",
			features: ["drinks.markup"],
		});
		await controlDb()
			.update(tenants)
			.set({ branding: { paypalUrl: "https://paypal.me/hassia" } })
			.where(eq(tenants.id, tenant.id));

		expect(await requireCurrentTenant()).toEqual({
			id: tenant.id,
			slug: "hassia",
			displayName: "Corps Hassia",
			branding: { paypalUrl: "https://paypal.me/hassia" },
			features: { ...defaultFeatureFlags(), "drinks.markup": true },
		});
	});
});

describe("getTenantById", () => {
	test("returns null for unknown ids", async () => {
		await createTenant();
		expect(await getTenantById("does-not-exist")).toBeNull();
	});

	test("serves the cached tenant until it is cleared or expires", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
		const tenant = await createTenant({ displayName: "Alt" });
		await getTenantById(tenant.id);

		const rename = (displayName: string) =>
			controlDb()
				.update(tenants)
				.set({ displayName })
				.where(eq(tenants.id, tenant.id));

		await rename("Neu");
		expect((await getTenantById(tenant.id))?.displayName).toBe("Alt");

		clearTenantCache(tenant.id);
		expect((await getTenantById(tenant.id))?.displayName).toBe("Neu");

		await rename("Neuer");
		clearTenantCache();
		expect((await getTenantById(tenant.id))?.displayName).toBe("Neuer");

		await rename("Am neuesten");
		vi.setSystemTime(new Date("2026-10-26T12:01:01Z"));
		expect((await getTenantById(tenant.id))?.displayName).toBe("Am neuesten");
	});

	test("clearing one tenant keeps the others cached", async () => {
		const a = await createTenant({ displayName: "A" });
		const b = await createTenant({ displayName: "B" });
		await getTenantById(a.id);
		await getTenantById(b.id);
		await controlDb().update(tenants).set({ displayName: "changed" });

		clearTenantCache(a.id);

		expect((await getTenantById(a.id))?.displayName).toBe("changed");
		expect((await getTenantById(b.id))?.displayName).toBe("B");
	});

	test("all flags stay off when the flag table cannot be read", async () => {
		const tenant = await createTenant({ features: ["drinks.markup"] });
		await requireControl().client.execute("DROP TABLE control_tenant_feature");
		const error = vi.spyOn(console, "error").mockImplementation(() => {});

		const loaded = await getTenantById(tenant.id);

		expect(loaded?.features).toEqual(defaultFeatureFlags());
		expect(error).toHaveBeenCalled();
	});
});

describe("hasActiveMembership", () => {
	test("only an active membership in that tenant counts", async () => {
		const a = await createTenant();
		const b = await createTenant();
		const active = await createUser();
		const suspended = await createUser({ membership: "suspended" });
		const pending = await createUser({ membership: "pending" });

		expect(await hasActiveMembership(active.id, a.id)).toBe(true);
		expect(await hasActiveMembership(active.id, b.id)).toBe(false);
		expect(await hasActiveMembership(suspended.id, a.id)).toBe(false);
		expect(await hasActiveMembership(pending.id, a.id)).toBe(false);
	});

	test("caches the answer for a minute", async () => {
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
		const tenant = await createTenant();
		const user = await createUser();
		expect(await hasActiveMembership(user.id, tenant.id)).toBe(true);

		await controlDb()
			.update(tenantMemberships)
			.set({ status: "suspended" })
			.where(eq(tenantMemberships.userId, user.id));

		vi.setSystemTime(new Date("2026-10-26T12:00:30Z"));
		expect(await hasActiveMembership(user.id, tenant.id)).toBe(true);
		vi.setSystemTime(new Date("2026-10-26T12:01:01Z"));
		expect(await hasActiveMembership(user.id, tenant.id)).toBe(false);
	});
});

describe("getCurrentRequestOrigin", () => {
	test("prefers the forwarded host and protocol", async () => {
		testState.headers = {
			host: "internal:8080",
			"x-forwarded-host": "hassia.example",
			"x-forwarded-proto": "http",
		};
		expect(await getCurrentRequestOrigin()).toBe("http://hassia.example");
	});

	test("defaults to https for public hosts, keeping the port", async () => {
		testState.headers = { host: "hassia.example:8443" };
		expect(await getCurrentRequestOrigin()).toBe("https://hassia.example:8443");
	});

	test("uses http for localhost and loopback addresses", async () => {
		testState.headers = { host: "localhost:3000" };
		expect(await getCurrentRequestOrigin()).toBe("http://localhost:3000");
		testState.headers = { host: "127.0.0.1:3000" };
		expect(await getCurrentRequestOrigin()).toBe("http://127.0.0.1:3000");
	});

	test("uses http for tenant subdomains of localhost (#155)", async () => {
		// load-providers.ts treats `*.localhost` as a local http origin; the
		// request origin used in invitation links should agree.
		testState.headers = { host: "hassia.localhost:3000" };
		expect(await getCurrentRequestOrigin()).toBe(
			"http://hassia.localhost:3000",
		);
	});

	test("falls back to BETTER_AUTH_URL without a host or request", async () => {
		testState.headers = { host: "" };
		expect(await getCurrentRequestOrigin()).toBe("http://localhost:3000");

		testState.headers = { host: "hassia.example" };
		vi.spyOn(nextHeaders, "headers").mockRejectedValueOnce(
			new Error("headers() outside a request"),
		);
		expect(await getCurrentRequestOrigin()).toBe("http://localhost:3000");
	});
});
