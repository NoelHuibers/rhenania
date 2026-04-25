import { type Client, createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";

import { env } from "~/env";
import * as controlSchema from "./control-schema";

const globalForControlDb = globalThis as unknown as {
	controlClient: Client | undefined;
};

export const controlClient =
	globalForControlDb.controlClient ??
	createClient({
		url: env.CONTROL_DATABASE_URL,
		authToken: env.CONTROL_DATABASE_AUTH_TOKEN,
	});
if (env.NODE_ENV !== "production")
	globalForControlDb.controlClient = controlClient;

export const controlDb = drizzle(controlClient, { schema: controlSchema });
