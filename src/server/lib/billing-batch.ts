// billing-batch.ts — how a billing run writes (#23).
//
// A run reads what it needs in one batch, computes the bills in memory and
// writes them with `writeBatch`: one round trip, all or nothing, and the
// write lock is held only while that batch runs. Because the read and the
// write are separate round trips, the write re-checks what the run read:
// `unchangedSince` is true when the outstanding bills and the orders to bill
// are still as read. The run turns a failed check into a constraint error
// that rolls the batch back (see the runs), so a payment, a deferral or a
// second run in between never leads to a bill computed from stale data.

import type { InArgs, InStatement } from "@libsql/client";
import { and, eq, getTableName, inArray, or, type SQL, sql } from "drizzle-orm";
import type { SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { client, db } from "~/server/db";

/** Rows per multi-row INSERT, well below SQLite's bound-parameter limit. */
const INSERT_CHUNK = 200;

/** Shown when the data changed between reading and writing a run. */
export const BILLING_CONFLICT_MESSAGE =
	"Während der Abrechnung haben sich Bestellungen oder Rechnungen geändert. Es wurde nichts gespeichert, bitte die Abrechnung neu starten";

/** `rows` in slices small enough for one multi-row INSERT each. */
export function insertChunks<T>(rows: T[]): T[][] {
	const out: T[][] = [];
	for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
		out.push(rows.slice(i, i + INSERT_CHUNK));
	}
	return out;
}

type Statement = { toSQL(): { sql: string; params: unknown[] } };

/**
 * Runs drizzle statements as one libSQL batch in "write" mode (BEGIN
 * IMMEDIATE): a single round trip that commits all of them or none.
 */
export async function writeBatch(statements: Statement[]): Promise<void> {
	await client.batch(
		statements.map((statement): InStatement => {
			const query = statement.toSQL();
			return { sql: query.sql, args: query.params as InArgs };
		}),
		"write",
	);
}

type BillsTable = SQLiteTable & {
	id: SQLiteColumn;
	status: SQLiteColumn;
};

/**
 * True while the outstanding bills (Unbezahlt or Gestundet) are exactly the
 * ones read, each with the status read, and `stillBillable` holds for all
 * `orderIds`.
 */
export function unchangedSince(
	read: {
		billsTable: BillsTable;
		outstanding: { id: string; status: string }[];
	},
	orders: { table: SQLiteTable; stillBillable: SQL | undefined; count: number },
): SQL {
	const { billsTable: b, outstanding } = read;
	const idsWith = (status: string) =>
		outstanding.filter((r) => r.status === status).map((r) => r.id);
	const isOutstanding = or(
		eq(b.status, "Unbezahlt"),
		eq(b.status, "Gestundet"),
	);
	const asRead = or(
		and(inArray(b.id, idsWith("Unbezahlt")), eq(b.status, "Unbezahlt")),
		and(inArray(b.id, idsWith("Gestundet")), eq(b.status, "Gestundet")),
	);
	return sql`(${db.$count(b, isOutstanding)} = ${outstanding.length}
		and ${db.$count(b, asRead)} = ${outstanding.length}
		and ${db.$count(orders.table, orders.stillBillable)} = ${orders.count})`;
}

/**
 * True when `error` (or its cause) is a constraint failure on `column`, as
 * libSQL reports it: "… constraint failed: <table>.<column>".
 */
export function isConstraintOn(
	error: unknown,
	table: SQLiteTable,
	column: SQLiteColumn,
): boolean {
	const target = `${getTableName(table)}.${column.name}`;
	let current: unknown = error;
	for (let depth = 0; depth < 10 && current; depth++) {
		const message = (current as { message?: unknown }).message;
		if (typeof message === "string" && message.includes(target)) {
			return true;
		}
		current = (current as { cause?: unknown }).cause;
	}
	return false;
}
