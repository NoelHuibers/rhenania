// open-bill.ts — the "open bill" banner and card (#80) on /trinken and the
// profile.

import "server-only";

import type { auth } from "~/server/auth";
import { scopeOf } from "~/server/lib/tenant-scope";
import { type OpenBill, openBillOf } from "~/server/modules/billing/service";

type Session = NonNullable<Awaited<ReturnType<typeof auth>>>;

/**
 * The signed-in member's open bill, or null when there is nothing to pay.
 * Takes the page's session, so the page's own check is the only one.
 */
export async function loadOpenBill(session: Session): Promise<OpenBill | null> {
	return openBillOf(await scopeOf(session.tenantId), session.user.id);
}
