import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { expect, test } from "vitest";

const require = createRequire(import.meta.url);

test("CI visual job uses the Playwright image matching @playwright/test", () => {
	const { version } = require("@playwright/test/package.json") as {
		version: string;
	};
	const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
	const tag = /mcr\.microsoft\.com\/playwright:v([\d.]+)-noble/.exec(
		workflow,
	)?.[1];
	expect(tag).toBe(version);
});

test("every mutation-testing path exists (Stryker skips missing ones silently)", async () => {
	const { globSync } = await import("node:fs");
	// Read as text: importing the .mjs would make tsc check its JSDoc types.
	const stryker = readFileSync("stryker.config.mjs", "utf8");
	const mutate = [
		...(stryker.match(/mutate:\s*\[([^\]]*)\]/)?.[1] ?? "").matchAll(
			/"([^"]+)"/g,
		),
	].map((m) => m[1] as string);
	const vitestStryker = (await import("../vitest.stryker.config")).default as {
		test: { include: string[] };
	};
	expect(mutate.length).toBeGreaterThan(0);
	const unmatched = [...mutate, ...vitestStryker.test.include].filter(
		(pattern) => globSync(pattern).length === 0,
	);
	expect(unmatched).toEqual([]);
});
