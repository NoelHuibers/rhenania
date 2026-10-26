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
