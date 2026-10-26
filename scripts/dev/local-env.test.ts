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
});
