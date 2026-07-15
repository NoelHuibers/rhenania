// scripts/repair-orphaned-bill-carryover.ts
//
// One-off repair for outstanding bills that were never carried forward.
//
// The carry-over in createNewBilling used to look only at the immediately
// previous bill period, and only for members who had new orders. A member
// whose debt sat two or more periods back (because an intermediate run
// skipped them) ended up with the old bill still "Unbezahlt" AND a new bill
// without the Übertrag — listed twice in the offene Mitgliederrechnungen.
//
// This script finds every real member (event bills excluded) with
// Unbezahlt/Gestundet bills in periods OLDER than the latest one:
//   - if they also have a bill in the latest period, the old amounts are
//     folded into that bill's Übertrag (no retroactive fees) and the old
//     bills are settled as "Übertragen";
//   - if they have no current bill, nothing is changed — they are listed
//     only once, and the fixed createNewBilling will carry them next run.
//
//   pnpm tsx scripts/repair-orphaned-bill-carryover.ts           # dry run
//   pnpm tsx scripts/repair-orphaned-bill-carryover.ts --apply   # write

import "dotenv/config";

import { and, desc, eq, inArray, ne, or } from "drizzle-orm";

import { db } from "~/server/db";
import { billPeriods, bills } from "~/server/db/schema";

const apply = process.argv.includes("--apply");

function fmt(n: number) {
	return `€${n.toFixed(2)}`;
}

async function main() {
	const [latestPeriod] = await db
		.select()
		.from(billPeriods)
		.orderBy(desc(billPeriods.createdAt))
		.limit(1);
	if (!latestPeriod) {
		console.log("No bill periods found — nothing to repair.");
		process.exit(0);
	}
	console.log(
		`Latest period: ${latestPeriod.billNumber} (${latestPeriod.closedAt ? "closed" : "open"})\n`,
	);

	// Outstanding member bills OUTSIDE the latest period.
	const orphaned = await db
		.select({
			id: bills.id,
			userId: bills.userId,
			userName: bills.userName,
			total: bills.total,
			status: bills.status,
			billPeriodId: bills.billPeriodId,
		})
		.from(bills)
		.where(
			and(
				or(eq(bills.status, "Unbezahlt"), eq(bills.status, "Gestundet")),
				ne(bills.billPeriodId, latestPeriod.id),
			),
		);

	const byUser = new Map<string, typeof orphaned>();
	for (const b of orphaned) {
		if (b.userId.startsWith("event-")) continue;
		const list = byUser.get(b.userId) ?? [];
		list.push(b);
		byUser.set(b.userId, list);
	}

	if (byUser.size === 0) {
		console.log("No orphaned outstanding member bills found. ✅");
		process.exit(0);
	}

	const now = new Date();
	let folded = 0;
	let leftAlone = 0;

	for (const [userId, oldBills] of byUser.entries()) {
		const oldSum = oldBills.reduce((s, b) => s + (Number(b.total) || 0), 0);
		const name = oldBills[0]?.userName ?? userId;

		const [currentBill] = await db
			.select({
				id: bills.id,
				oldBillingAmount: bills.oldBillingAmount,
				total: bills.total,
				status: bills.status,
			})
			.from(bills)
			.where(
				and(eq(bills.billPeriodId, latestPeriod.id), eq(bills.userId, userId)),
			)
			.limit(1);

		if (!currentBill) {
			leftAlone++;
			console.log(
				`- ${name}: ${fmt(oldSum)} outstanding in older period(s), no bill in ${latestPeriod.billNumber} — left as is (next billing run carries it).`,
			);
			continue;
		}

		folded++;
		const newOld = (Number(currentBill.oldBillingAmount) || 0) + oldSum;
		const newTotal = (Number(currentBill.total) || 0) + oldSum;
		console.log(
			`- ${name}: folding ${fmt(oldSum)} (${oldBills.length} old bill(s)) into ${latestPeriod.billNumber} → Übertrag ${fmt(newOld)}, total ${fmt(newTotal)}${apply ? "" : " [dry run]"}`,
		);

		if (apply) {
			await db
				.update(bills)
				.set({ oldBillingAmount: newOld, total: newTotal, updatedAt: now })
				.where(eq(bills.id, currentBill.id));
			await db
				.update(bills)
				.set({ status: "Übertragen", updatedAt: now })
				.where(
					inArray(
						bills.id,
						oldBills.map((b) => b.id),
					),
				);
		}
	}

	console.log(
		`\n${apply ? "Repaired" : "Would repair"} ${folded} member(s); ${leftAlone} left for the next billing run.`,
	);
	if (!apply) console.log("Re-run with --apply to write the changes.");
	process.exit(0);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
