// scripts/dev/local-env.ts — environment for local development and E2E runs
// against local libSQL files in `.data/`, never the production databases.
//
// Next.js loads `.env*` files on its own, but it never overrides a variable
// that is already set — even to an empty string. So every key found in any
// `.env*` file is set to "" here, then the local values are filled in. The
// result: production credentials in `.env` are invisible to the app.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "dotenv";

export const ROOT = process.cwd();
export const DATA_DIR = path.resolve(
	ROOT,
	process.env.LOCAL_DATA_DIR ?? ".data",
);
export const LOCAL_DB = {
	control: path.join(DATA_DIR, "control.db"),
	rhenania: path.join(DATA_DIR, "rhenania.db"),
	hassia: path.join(DATA_DIR, "hassia.db"),
} as const;
export const MAIL_OUTBOX = path.join(DATA_DIR, "mail");

const ENV_FILES = [
	".env",
	".env.local",
	".env.development",
	".env.development.local",
	".env.production",
	".env.production.local",
	".env.test",
	".env.test.local",
];

function keysIn(file: string): string[] {
	const full = path.join(ROOT, file);
	if (!existsSync(full)) return [];
	const content = readFileSync(full, "utf8");
	// dotenv's own parser (same syntax Next.js accepts, incl. `KEY: value`),
	// plus a loose scan as a second net for anything it might skip.
	const loose = content
		.split("\n")
		.map(
			(line) =>
				/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*[=:]/.exec(line)?.[1],
		)
		.filter((key): key is string => Boolean(key));
	return [...new Set([...Object.keys(parse(content)), ...loose])];
}

const CREDENTIAL = /TOKEN|SECRET|PASSWORD|DATABASE_URL|_KEY$/;

export function localEnv(
	extra: Record<string, string> = {},
): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env };
	for (const file of ENV_FILES) {
		for (const key of keysIn(file)) env[key] = "";
	}
	for (const key of Object.keys(env)) {
		if (CREDENTIAL.test(key)) env[key] = "";
	}
	Object.assign(env, {
		DATABASE_URL: `file:${LOCAL_DB.rhenania}`,
		CONTROL_DATABASE_URL: `file:${LOCAL_DB.control}`,
		BETTER_AUTH_URL: "http://localhost:3000",
		AUTH_SECRET: "local-dev-secret-not-for-production",
		MAIL_OUTBOX_DIR: MAIL_OUTBOX,
		TURSO_GROUP: "local",
		NEXT_TELEMETRY_DISABLED: "1",
		...extra,
	});
	assertLocal(env);
	return env;
}

export function assertLocal(env: Record<string, string | undefined>) {
	for (const key of ["DATABASE_URL", "CONTROL_DATABASE_URL"]) {
		const value = env[key] ?? "";
		if (!value.startsWith("file:")) {
			throw new Error(`${key} must be a local file: URL here, got "${value}".`);
		}
	}
}
