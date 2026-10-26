// Mitglieder fixtures: Adressliste rows, the per-tenant member status
// taxonomy and Semesterbeitrag runs/charges.

import {
	memberStatuses,
	members,
	semesterbeitragCharges,
	semesterbeitragRuns,
} from "~/server/db/schema";
import { tenantDb } from "../harness";
import type { KpRef } from "./cc-kasse";

let counter = 0;
const next = () => ++counter;

export async function createMember(
	opts: Partial<typeof members.$inferInsert> = {},
	tenantId?: string,
) {
	const n = next();
	const [row] = await tenantDb(tenantId)
		.insert(members)
		.values({
			status: "CB",
			firstName: `Vorname${n}`,
			lastName: `Nachname${n}`,
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create member");
	return row;
}

export async function setMemberStatuses(
	statuses: {
		key: string;
		label?: string;
		beitragspflichtig?: boolean;
		isActive?: boolean;
	}[],
	tenantId?: string,
) {
	await tenantDb(tenantId)
		.insert(memberStatuses)
		.values(
			statuses.map((s, i) => ({
				key: s.key,
				label: s.label ?? s.key,
				beitragspflichtig: s.beitragspflichtig ?? false,
				isActive: s.isActive ?? true,
				displayOrder: i,
			})),
		);
}

export async function createBeitragRun(
	kp: KpRef,
	opts: Partial<
		Omit<typeof semesterbeitragRuns.$inferInsert, "kostenpunktId" | "etaplanId">
	> = {},
	tenantId?: string,
) {
	const [row] = await tenantDb(tenantId)
		.insert(semesterbeitragRuns)
		.values({
			kostenpunktId: kp.id,
			etaplanId: kp.etaplanId,
			name: `Semesterbeitrag ${next()}`,
			amount: 28,
			mahnungFee: 5,
			dueDate: new Date("2026-05-01T00:00:00Z"),
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create beitrag run");
	return row;
}

export async function createCharge(
	runId: string,
	member: { id: string; firstName: string; lastName: string },
	opts: Partial<
		Omit<typeof semesterbeitragCharges.$inferInsert, "runId" | "memberId">
	> = {},
	tenantId?: string,
) {
	const [row] = await tenantDb(tenantId)
		.insert(semesterbeitragCharges)
		.values({
			runId,
			memberId: member.id,
			memberName: `${member.firstName} ${member.lastName}`,
			baseAmount: 28,
			...opts,
		})
		.returning();
	if (!row) throw new Error("Could not create charge");
	return row;
}
