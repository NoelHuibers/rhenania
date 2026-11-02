// No implicit production database (#33): importing the db modules opens
// nothing, the request's scope can't be had outside a request, and scripts
// pick their database explicitly through getScriptDb.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { env } from "~/env";
import { setupTestDatabases } from "../../../test/harness";

vi.unmock("~/server/db/tenants");
// The real request API: outside a Next.js request, headers() throws.
vi.unmock("next/headers");

const created = vi.hoisted(() => [] as Array<{ url: string }>);
vi.mock("./libsql", async (importOriginal) => {
	const real = await importOriginal<typeof import("./libsql")>();
	return {
		createClient: (config: { url: string }) => {
			created.push({ url: config.url });
			// Never the configured file: an in-memory DB stands in for it.
			return real.createClient({ url: ":memory:" });
		},
	};
});

setupTestDatabases();

beforeEach(() => {
	created.length = 0;
	vi.resetModules();
});
afterEach(() => {
	vi.unstubAllEnvs();
});

describe("db modules", () => {
	test("open no connection on import", async () => {
		await import("./tenants");
		await import("./script");

		expect(created).toEqual([]);
	});

	test("the request's scope throws outside a request instead of falling back", async () => {
		const { currentTenantScope } = await import("~/server/lib/tenant-scope");

		await expect(currentTenantScope()).rejects.toThrow();
		expect(created).toEqual([]);
	});
});

describe("script db", () => {
	test("connects to DATABASE_URL on first use, once", async () => {
		const { getScriptDb } = await import("./script");

		const first = getScriptDb();
		const second = getScriptDb();

		expect(created).toEqual([{ url: env.DATABASE_URL }]);
		expect(second).toBe(first);
		expect((await first.client.execute("select 1 as one")).rows[0]?.one).toBe(
			1,
		);
	});

	test("is refused inside the Next.js server", async () => {
		vi.stubEnv("NEXT_RUNTIME", "nodejs");
		const { getScriptDb } = await import("./script");

		expect(() => getScriptDb()).toThrow(/CLI scripts/);
		expect(created).toEqual([]);
	});
});
