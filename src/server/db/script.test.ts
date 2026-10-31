// The proxy `db` has no production fallback (#33): importing the db modules
// opens nothing, using the proxy outside a request throws, and scripts pick
// their database explicitly through getScriptDb / runWithScriptDb.

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { env } from "~/env";
import { drinks } from "~/server/db/schema";
import {
	createDrink,
	createTenant,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { testState } from "../../../test/state";

vi.unmock("~/server/db");
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
		await import("./index");
		await import("./tenants");
		await import("./script");

		expect(created).toEqual([]);
	});

	test("the proxy throws outside a request instead of falling back", async () => {
		const { db, NoDbContextError } = await import("./index");

		const error = (await db
			.select()
			.from(drinks)
			.catch((e: unknown) => e)) as Error & { cause?: Error };

		expect(error.cause ?? error).toBeInstanceOf(NoDbContextError);
		expect(created).toEqual([]);
	});

	test("runWithDb sends proxy queries to the given database", async () => {
		const tenant = await createTenant();
		await createDrink({ name: "Pils" }, tenant.id);
		const { db, runWithDb } = await import("./index");
		const target = testState.tenants.get(tenant.id)?.client;
		if (!target) {
			throw new Error("no test tenant client");
		}

		const names = await runWithDb(target, async () =>
			(await db.select().from(drinks)).map((d) => d.name),
		);

		expect(names).toEqual(["Pils"]);
		expect(await tenantDb(tenant.id).select().from(drinks)).toHaveLength(1);
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

	test("runWithScriptDb binds the proxy to the script database", async () => {
		const { db } = await import("./index");
		const { getScriptDb, runWithScriptDb } = await import("./script");
		await getScriptDb().client.execute(
			"create table drink (id text primary key, name text not null)",
		);
		await getScriptDb().client.execute(
			"insert into drink (id, name) values ('d1', 'Script-Pils')",
		);

		const names = await runWithScriptDb(async () =>
			(await db.select({ name: drinks.name }).from(drinks)).map((d) => d.name),
		);

		expect(names).toEqual(["Script-Pils"]);
	});

	test("is refused inside the Next.js server", async () => {
		vi.stubEnv("NEXT_RUNTIME", "nodejs");
		const { getScriptDb } = await import("./script");

		expect(() => getScriptDb()).toThrow(/CLI scripts/);
		expect(created).toEqual([]);
	});
});
