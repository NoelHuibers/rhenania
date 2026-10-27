// Counts database round trips. Every test DB client is wrapped by
// `instrumentClient()` (see `test/db.ts`); `countQueries()` records what the
// wrapped clients send while the given function runs.
//
//   const { result, total, writes } = await countQueries(() => loadPage());
//
// One round trip is one `execute`, one `batch` (all its statements travel
// together), or one statement / commit inside an interactive transaction.

import type { Client, InArgs, InStatement, Transaction } from "@libsql/client";

export type QueryDb = "tenant" | "control";

export type QueryLogEntry = {
	db: QueryDb;
	kind: "execute" | "batch" | "transaction";
	/** SQL of the round trip; several for a batch. */
	sql: string[];
	/** Bound arguments, one entry per `sql` statement. */
	args: InArgs[];
};

let activeLog: QueryLogEntry[] | null = null;

type AnyStatement = InStatement | [string, unknown?];

function sqlOf(stmt: AnyStatement): string {
	if (typeof stmt === "string") {
		return stmt;
	}
	return Array.isArray(stmt) ? stmt[0] : stmt.sql;
}

function argsOf(stmt: AnyStatement): InArgs {
	if (typeof stmt === "string") {
		return [];
	}
	return (
		((Array.isArray(stmt) ? stmt[1] : stmt.args) as InArgs | undefined) ?? []
	);
}

function record(entry: QueryLogEntry) {
	activeLog?.push(entry);
}

function instrumentTransaction(tx: Transaction, db: QueryDb): Transaction {
	return new Proxy(tx, {
		get(target, prop) {
			if (prop === "execute") {
				return (stmt: InStatement) => {
					record({
						db,
						kind: "transaction",
						sql: [sqlOf(stmt)],
						args: [argsOf(stmt)],
					});
					return target.execute(stmt);
				};
			}
			if (prop === "batch") {
				return (stmts: InStatement[]) => {
					record({
						db,
						kind: "transaction",
						sql: stmts.map(sqlOf),
						args: stmts.map(argsOf),
					});
					return target.batch(stmts);
				};
			}
			if (prop === "commit") {
				return () => {
					record({ db, kind: "transaction", sql: ["COMMIT"], args: [[]] });
					return target.commit();
				};
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

/** Wraps a libSQL client so `countQueries()` can see its round trips. */
export function instrumentClient(client: Client, db: QueryDb): Client {
	return new Proxy(client, {
		get(target, prop) {
			if (prop === "execute") {
				return (...args: Parameters<Client["execute"]>) => {
					record({
						db,
						kind: "execute",
						sql: [sqlOf(args[0] as AnyStatement)],
						// `execute(sql, args)` or `execute({ sql, args })`.
						args: [
							typeof args[0] === "string"
								? ((args[1] as InArgs | undefined) ?? [])
								: argsOf(args[0] as AnyStatement),
						],
					});
					return (target.execute as (...a: unknown[]) => unknown)(...args);
				};
			}
			if (prop === "batch") {
				return (...args: Parameters<Client["batch"]>) => {
					record({
						db,
						kind: "batch",
						sql: args[0].map(sqlOf),
						args: args[0].map(argsOf),
					});
					return target.batch(...args);
				};
			}
			if (prop === "transaction") {
				return async (...args: Parameters<Client["transaction"]>) =>
					instrumentTransaction(await target.transaction(...args), db);
			}
			const value = Reflect.get(target, prop, target);
			return typeof value === "function" ? value.bind(target) : value;
		},
	});
}

const WRITE = /^\s*(insert|update|delete|replace)\b/i;

export type QueryCount<T> = {
	result: T;
	log: QueryLogEntry[];
	/** Round trips to any database. */
	total: number;
	tenant: number;
	control: number;
	/** Round trips that contain at least one INSERT/UPDATE/DELETE. */
	writes: number;
};

/** Runs `fn` and counts the database round trips it causes. */
export async function countQueries<T>(
	fn: () => Promise<T>,
): Promise<QueryCount<T>> {
	if (activeLog) {
		throw new Error("countQueries() calls must not be nested");
	}
	const log: QueryLogEntry[] = [];
	activeLog = log;
	let result: T;
	try {
		result = await fn();
	} finally {
		activeLog = null;
	}
	return {
		result,
		log,
		total: log.length,
		tenant: log.filter((e) => e.db === "tenant").length,
		control: log.filter((e) => e.db === "control").length,
		writes: log.filter((e) => e.sql.some((s) => WRITE.test(s))).length,
	};
}
