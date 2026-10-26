// Fresh, migrated libSQL file databases for tests.

import { randomUUID } from "node:crypto";
import { copyFileSync, rmSync } from "node:fs";
import path from "node:path";
import { type Client, createClient } from "@libsql/client";
import { drizzle, type LibSQLDatabase } from "drizzle-orm/libsql";
import { inject } from "vitest";

import * as controlSchema from "~/server/db/control-schema";
import * as tenantSchema from "~/server/db/schema";
import { instrumentClient, type QueryDb } from "./query-count";

export type TenantTestDb = {
	url: string;
	client: Client;
	db: LibSQLDatabase<typeof tenantSchema>;
	close: () => void;
};

export type ControlTestDb = {
	url: string;
	client: Client;
	db: LibSQLDatabase<typeof controlSchema>;
	close: () => void;
};

function copyTemplate(kind: QueryDb) {
	const templates = inject("testDbTemplates");
	const file = path.join(templates.dir, `${kind}-${randomUUID()}.db`);
	copyFileSync(templates[kind], file);
	const url = `file:${file}`;
	const raw = createClient({ url });
	const client = instrumentClient(raw, kind);
	const close = () => {
		raw.close();
		rmSync(file, { force: true });
	};
	return { url, client, close };
}

export function createTenantTestDb(): TenantTestDb {
	const { url, client, close } = copyTemplate("tenant");
	return { url, client, db: drizzle(client, { schema: tenantSchema }), close };
}

export function createControlTestDb(): ControlTestDb {
	const { url, client, close } = copyTemplate("control");
	return { url, client, db: drizzle(client, { schema: controlSchema }), close };
}
