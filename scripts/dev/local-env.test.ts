import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test, vi } from "vitest";

import { assertLocal, LOCAL_DB, localEnv } from "./local-env";

describe("localEnv", () => {
	test("points every database at local files and blanks credentials", () => {
		vi.stubEnv("TURSO_PLATFORM_TOKEN", "prod-token");
		vi.stubEnv("SOME_API_KEY", "prod-key");
		vi.stubEnv("DATABASE_AUTH_TOKEN", "prod-db-token");

		const env = localEnv();

		expect(env.DATABASE_URL).toBe(`file:${LOCAL_DB.rhenania}`);
		expect(env.CONTROL_DATABASE_URL).toBe(`file:${LOCAL_DB.control}`);
		expect(env.TURSO_PLATFORM_TOKEN).toBe("");
		expect(env.SOME_API_KEY).toBe("");
		expect(env.DATABASE_AUTH_TOKEN).toBe("");
		expect(env.MAIL_OUTBOX_DIR).toBeTruthy();
		vi.unstubAllEnvs();
	});

	test("rejects remote database URLs", () => {
		expect(() => localEnv({ DATABASE_URL: "libsql://prod.turso.io" })).toThrow(
			/local file/,
		);
		expect(() =>
			assertLocal({
				DATABASE_URL: "file:a.db",
				CONTROL_DATABASE_URL: "https://x",
			}),
		).toThrow(/CONTROL_DATABASE_URL/);
	});

	test("blanks keys from .env files in every syntax dotenv accepts", async () => {
		const dir = mkdtempSync(path.join(os.tmpdir(), "rhenania-env-"));
		writeFileSync(
			path.join(dir, ".env"),
			[
				"PLAIN=1",
				"export EXPORTED=2",
				'COLON_STYLE: "3"',
				"  SPACED = 4",
				"# COMMENTED=5",
			].join("\n"),
		);
		const cwd = process.cwd();
		process.chdir(dir);
		vi.resetModules();
		try {
			const mod = await import("./local-env");
			const env = mod.localEnv();
			for (const key of ["PLAIN", "EXPORTED", "COLON_STYLE", "SPACED"]) {
				expect(env[key], key).toBe("");
			}
		} finally {
			process.chdir(cwd);
			rmSync(dir, { recursive: true, force: true });
		}
	});
});
