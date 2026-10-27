import { and, eq, gt, lt, type SQL, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { type bills, fuchsenBills } from "~/server/db/schema";

// A billing run carries a member's open bills into their new bill and marks
// them "Übertragen". Paying that newer bill settles them in the same step,
// with the same `paidAt`. No column links a carried bill to the bill it was
// carried into, so that shared payment time is the link: a member's earlier
// bill that is "Bezahlt" with the same `paidAt` as a later paid bill was paid
// through it. Getränke and Fuchsenladen use the same rule.

/** Getränke and Fuchsenladen bills share every column the rule reads. */
type BillTable = typeof bills | typeof fuchsenBills;

export const CARRIED_BILL_ERROR =
	"Diese Rechnung wurde in eine spätere Rechnung übertragen und wird dort bezahlt";

export const PAID_THROUGH_LATER_BILL_ERROR =
	"Diese Rechnung wurde mit der späteren Rechnung bezahlt, in die sie übertragen wurde. Ändere den Status dort.";

/**
 * `status = ?` for lookups within one member's bills. fuchsen_bill has no
 * (userId, status) index (bill has bill_user_status_idx), and with a plain
 * equality SQLite walks fuchsen_bill_status_idx, every paid or carried bill
 * of every member, instead of fuchsen_bill_user_idx. The unary + keeps the
 * term off the index. Drop it once fuchsen_bill gets a composite index.
 */
export function memberBillStatus(
	table: BillTable,
	status: "Bezahlt" | "Übertragen",
): SQL {
	return table === fuchsenBills
		? sql`+${table.status} = ${status}`
		: eq(table.status, status);
}

/**
 * The member's earlier bills that were paid together with `bill`: the ones
 * it settled when it was paid, to reopen as "Übertragen" when that payment
 * is undone.
 */
export function paidAlongWith(
	table: BillTable,
	bill: { userId: string; createdAt: Date; paidAt: Date },
): SQL | undefined {
	return and(
		eq(table.userId, bill.userId),
		lt(table.createdAt, bill.createdAt),
		memberBillStatus(table, "Bezahlt"),
		eq(table.paidAt, bill.paidAt),
	);
}

/**
 * Why the status of `bill` can't be changed on its own, or null. A carried
 * bill and a bill paid through the later bill it was carried into are only
 * settled or reopened through that later bill; reopening one on its own
 * would make the next run carry its amount a second time.
 */
export async function carriedBillRefusal(
	table: BillTable,
	bill: {
		userId: string;
		createdAt: Date;
		status: string;
		paidAt: Date | null;
	},
): Promise<string | null> {
	if (bill.status === "Übertragen") {
		return CARRIED_BILL_ERROR;
	}
	if (bill.status !== "Bezahlt" || !bill.paidAt) {
		return null;
	}
	const [later] = await db
		.select({ id: table.id })
		.from(table)
		.where(
			and(
				eq(table.userId, bill.userId),
				gt(table.createdAt, bill.createdAt),
				memberBillStatus(table, "Bezahlt"),
				eq(table.paidAt, bill.paidAt),
			),
		)
		.limit(1);
	return later ? PAID_THROUGH_LATER_BILL_ERROR : null;
}
