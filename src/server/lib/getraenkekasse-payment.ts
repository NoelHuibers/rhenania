// getraenkekasse-payment.ts — the bill's sender for code that has no
// TenantScope yet ("Inventur + Rechnung").
//
// The rules are in server/domain/getraenkekasse/payment.ts, the reads in
// the Getränkekasse service (server/modules/getraenkekasse); this resolves
// the current request's tenant and asks the service.

import "server-only";

import type { GetraenkeBillSenderResult } from "~/server/domain/getraenkekasse/payment";
import { billSender } from "~/server/modules/getraenkekasse/service";
import { currentTenantScope } from "./tenant-scope";

export { incompleteBillingMessage } from "~/server/domain/getraenkekasse/payment";

/**
 * Everything a bill needs from the current tenant. Lists the missing
 * pieces (German labels for the Getränkewart) when the setup is incomplete.
 */
export async function resolveGetraenkeBillSender(): Promise<GetraenkeBillSenderResult> {
	return billSender(await currentTenantScope());
}
