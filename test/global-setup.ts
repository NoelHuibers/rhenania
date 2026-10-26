// Migrates one tenant and one control template DB per test run. Each test
// then gets a cheap file copy of a template (see `test/db.ts`), so every test
// starts from a fully migrated, empty schema without re-running migrations.

import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import type { TestProject } from "vitest/node";

declare module "vitest" {
	export interface ProvidedContext {
		testDbTemplates: { dir: string; tenant: string; control: string };
	}
}

async function migrateTemplate(file: string, migrationsFolder: string) {
	const client = createClient({ url: `file:${file}` });
	try {
		await migrate(drizzle(client), { migrationsFolder });
	} finally {
		client.close();
	}
}

export default async function setup(project: TestProject) {
	const dir = mkdtempSync(path.join(os.tmpdir(), "rhenania-test-"));
	const tenant = path.join(dir, "template-tenant.db");
	const control = path.join(dir, "template-control.db");
	const root = process.cwd();

	await migrateTemplate(tenant, path.join(root, "drizzle"));
	await migrateTemplate(control, path.join(root, "drizzle", "control"));

	project.provide("testDbTemplates", { dir, tenant, control });

	return () => rmSync(dir, { recursive: true, force: true });
}
