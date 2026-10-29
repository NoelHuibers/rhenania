import { describe, expect, test } from "vitest";

import { compareToBaseline, importsProxyDb, isCountedFile } from "./proxy-db";

describe("proxy-db import count", () => {
	test("counts value imports of the proxy module, however spelled", () => {
		const file = "src/server/actions/x.ts";
		expect(importsProxyDb(file, 'import { db } from "~/server/db";')).toBe(
			true,
		);
		expect(
			importsProxyDb(file, 'import { client, db } from "~/server/db/index";'),
		).toBe(true);
		expect(
			importsProxyDb("src/server/actions/y.ts", 'import { db } from "../db";'),
		).toBe(true);
		expect(
			importsProxyDb(file, 'const { db } = await import("~/server/db");'),
		).toBe(true);
		expect(
			importsProxyDb(file, 'import {\n\tclient,\n\tdb,\n} from "~/server/db";'),
		).toBe(true);
	});

	test("ignores type-only imports and other db modules", () => {
		const file = "src/server/lib/x.ts";
		for (const source of [
			'import type { db } from "~/server/db";',
			'import { type db } from "~/server/db";',
			'import { users } from "~/server/db/schema";',
			'import { getTenantDb } from "~/server/db/tenants";',
			'import { controlDb } from "~/server/db/control";',
			'import { db } from "~/server/dbx";',
			'const label = "~/server/db";',
		]) {
			expect(importsProxyDb(file, source), source).toBe(false);
		}
		expect(
			importsProxyDb("src/server/db/index.ts", 'import { db } from "./index";'),
		).toBe(false);
	});

	test("counts app code and scripts, not tests", () => {
		expect(isCountedFile("src/server/actions/drinks.ts")).toBe(true);
		expect(isCountedFile("src/app/page.tsx")).toBe(true);
		expect(isCountedFile("scripts/ops/seed-control.ts")).toBe(true);
		expect(isCountedFile("src/server/db/routing.test.ts")).toBe(false);
		expect(isCountedFile("test/harness.ts")).toBe(false);
		expect(isCountedFile("src/env.d.ts")).toBe(false);
	});

	test("uses syntax rather than matching text in comments or strings", () => {
		const file = "src/server/actions/x.ts";
		for (const source of [
			'// import { db } from "~/server/db";',
			'/* import("~/server/db") */',
			'const example = `import { db } from "~/server/db";`;',
			'export { type db } from "~/server/db";',
		]) {
			expect(importsProxyDb(file, source)).toBe(false);
		}
		for (const source of [
			'export { db } from "~/server/db";',
			'import * as database from "~/server/db";',
			'import "~/server/db";',
			'const database = require("~/server/db");',
			'import { type Client, db as database } from "~/server/db";',
		]) {
			expect(importsProxyDb(file, source)).toBe(true);
		}
	});

	test("fails only when the count rises", () => {
		expect(compareToBaseline(5, 5)).toMatchObject({ ok: true });
		expect(compareToBaseline(4, 5)).toMatchObject({
			ok: true,
			message: expect.stringMatching(/fell from 5 to 4/),
		});
		expect(compareToBaseline(6, 5)).toMatchObject({
			ok: false,
			message: expect.stringMatching(/rose from 5 to 6/),
		});
	});
});
