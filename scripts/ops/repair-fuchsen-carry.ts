// scripts/ops/repair-fuchsen-carry.ts — one-off repair of Fuchsen bills that
// the old billing carried into a later bill without closing them (#12). Run it
// once per tenant BEFORE the first Fuchsen billing run with the new code,
// otherwise those amounts are charged a second time.
//
// Dry run (default, read-only) prints the plan and everything that needs a
// human look; --apply writes the status changes in one batch.
//
//   pnpm ops:repair-fuchsen-carry <slug>            # dry run
//   CONFIRM_PROD=<db-host> pnpm ops:repair-fuchsen-carry <slug> --apply

import "dotenv/config";

import type { Client, InStatement } from "@libsql/client";

import { guardOrExit } from "../lib/guard";
import { openTenant } from "../lib/tenants";
import {
	type BillChange,
	type FuchsenBillStatus,
	planFuchsenCarryRepair,
} from "./lib/fuchsen-carry";

const toDate = (v: unknown) => (v == null ? null : new Date(Number(v) * 1000));
const toSeconds = (d: Date | null) =>
	d ? Math.floor(d.getTime() / 1000) : null;

async function loadPlanInput(client: Client) {
	const periods = await client.execute(
		`SELECT "id", "billNumber", "createdAt" FROM "fuchsen_bill_period"`,
	);
	const bills = await client.execute(
		`SELECT "id", "billPeriodId", "userId", "userName", "status", "total",
		        "oldBillingAmount", "paidAt"
		 FROM "fuchsen_bill"`,
	);
	return {
		periods: periods.rows.map((r) => ({
			id: String(r.id),
			billNumber: String(r.billNumber),
			createdAt: toDate(r.createdAt) ?? new Date(0),
		})),
		bills: bills.rows.map((r) => ({
			id: String(r.id),
			billPeriodId: String(r.billPeriodId),
			userId: String(r.userId),
			userName: String(r.userName),
			status: String(r.status) as FuchsenBillStatus,
			total: Number(r.total) || 0,
			oldBillingAmount: Number(r.oldBillingAmount) || 0,
			paidAt: toDate(r.paidAt),
		})),
	};
}

// Bills whose orders and bill status disagree (#143): needs a human, because
// those amounts may already have been carried into later bills.
const ORDER_MISMATCH_SQL = `
	SELECT p."billNumber", b."userName", b."status",
	       sum(CASE WHEN o."status" = 'Bezahlt' THEN 1 ELSE 0 END) AS paidOrders,
	       count(o."id") AS orders
	FROM "fuchsen_bill" b
	JOIN "fuchsen_bill_period" p ON p."id" = b."billPeriodId"
	JOIN "fuchsen_order" o ON o."billId" = b."id"
	WHERE b."status" <> 'Bezahlt'
	GROUP BY b."id"
	HAVING paidOrders > 0
	ORDER BY p."createdAt", b."userName"`;

function changeStatements(change: BillChange): InStatement[] {
	const now = Math.floor(Date.now() / 1000);
	const paidAt = toSeconds(change.paidAt);
	const statements: InStatement[] = [
		{
			sql: `UPDATE "fuchsen_bill" SET "status" = ?, "paidAt" = ?, "updatedAt" = ?
			      WHERE "id" = ? AND "status" = ?`,
			args: [change.to, paidAt, now, change.billId, change.from],
		},
	];
	if (change.to === "Bezahlt") {
		statements.push({
			sql: `UPDATE "fuchsen_order" SET "status" = 'Bezahlt', "paidAt" = ?, "updatedAt" = ?
			      WHERE "billId" = ? AND "status" = 'Offen'`,
			args: [paidAt, now, change.billId],
		});
	}
	return statements;
}

async function main() {
	const [slug, flag] = process.argv.slice(2);
	if (!slug || (flag && flag !== "--apply")) {
		console.error("Usage: pnpm ops:repair-fuchsen-carry <slug> [--apply]");
		process.exit(1);
	}
	const apply = flag === "--apply";
	const { tenant, client } = await openTenant(slug);
	if (apply) {
		guardOrExit(tenant.dbUrl, `repair Fuchsen bills of '${slug}'`);
	}

	const { periods, bills } = await loadPlanInput(client);
	const { changes, anomalies } = planFuchsenCarryRepair(periods, bills);

	console.log(`${slug}: ${changes.length} bill(s) to close`);
	for (const c of changes) {
		console.log(
			`  ${c.billNumber}\t${c.userName}\t${c.from} → ${c.to}\t(carried into ${c.carriedInto})`,
		);
	}

	console.log(`\nNeeds a human look: ${anomalies.length} carried bill(s)`);
	for (const a of anomalies) {
		console.log(`  ${a.billNumber}\t${a.userName}\t${a.reason}`);
	}

	const mismatches = await client.execute(ORDER_MISMATCH_SQL);
	console.log(
		`\nNeeds a human look: ${mismatches.rows.length} unpaid bill(s) containing paid orders`,
	);
	for (const r of mismatches.rows) {
		console.log(
			`  ${r.billNumber}\t${r.userName}\t${r.status}\t${r.paidOrders}/${r.orders} orders paid`,
		);
	}

	if (!apply) {
		console.log("\nDry run: nothing written. Re-run with --apply to write.");
	} else if (changes.length > 0) {
		await client.batch(changes.flatMap(changeStatements), "write");
		console.log(`\nApplied ${changes.length} change(s).`);
	}
	client.close();
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
