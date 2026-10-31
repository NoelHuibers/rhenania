"use server";

import { auth } from "~/server/auth";
import { scopeOf } from "~/server/lib/tenant-scope";
import {
	type UserBillingData,
	userBillingData,
} from "~/server/modules/billing/service";

export async function getUserBillingData(): Promise<UserBillingData> {
	const session = await auth();
	if (!session?.user?.id) {
		throw new Error("User must be authenticated to view billing data");
	}
	return userBillingData(await scopeOf(session.tenantId), session.user.id);
}
