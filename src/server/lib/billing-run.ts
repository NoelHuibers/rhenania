// billing-run.ts — the Getränke billing run for the current request.
//
// The run itself is the billing service (server/modules/billing/run.ts).
// This entry point keeps the result shape "Inventur + Rechnung" reads:
// `{ success: false, message }` instead of an error. Deliberately not a
// server action: `inventoryLoss` is charged as Umlage, and a value a browser
// can send must never decide that (#10).

import "server-only";

import { auth } from "~/server/auth";
import {
	type BillingRunResult,
	runGetraenkeBilling as runBilling,
} from "~/server/modules/billing/run";
import { DomainError } from "./domain-error";
import { scopeOf } from "./tenant-scope";

type RunOutcome =
	| BillingRunResult
	| {
			success: false;
			message: string;
			error: string;
			billsCreated: 0;
			totalAmount: 0;
	  };

/**
 * Bills every unbilled order, carries open bills over and charges
 * `inventoryLoss` as Umlage to the active Hausbewohner, for the signed-in
 * caller's tenant. Only server code may pass a loss: the one read from the
 * inventory just closed.
 */
export async function runGetraenkeBilling({
	inventoryLoss,
}: {
	inventoryLoss: number;
}): Promise<RunOutcome> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}
	try {
		return await runBilling(await scopeOf(session.tenantId), session.user, {
			inventoryLoss,
		});
	} catch (error) {
		// The run logs its own failures; its message is meant for the user.
		if (!(error instanceof DomainError)) {
			throw error;
		}
		return {
			success: false,
			message: error.message,
			error: error.message,
			billsCreated: 0,
			totalAmount: 0,
		};
	}
}
