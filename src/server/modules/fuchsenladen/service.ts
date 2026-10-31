// service.ts — the Fuchsenladen: bills and payment details (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The billing run is in ./run.

import "server-only";

import { z } from "zod";
import { addMoney } from "~/lib/money";
import { renderFuchsenBillPdf } from "~/server/domain/fuchsenladen/bill-pdf";
import { fuchsenPeriodCsv } from "~/server/domain/fuchsenladen/csv";
import {
	ConflictError,
	DomainError,
	NotFoundError,
} from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

export type { FuchsenBillingConfig, FuchsenBillPeriod } from "./repo";

// ─── Bills ───────────────────────────────────────────────────────────────────

/** A bill (or the next run's preview of one) as <BillingTable> shows it. */
export interface FuchsenBillingEntry {
	id: string;
	name: string;
	totalDue: number;
	status?: repo.FuchsenBillStatus;
	oldBillingAmount?: number;
	itemsTotal?: number;
	paidAt?: Date | null;
	items: {
		id: string;
		name: string;
		quantity: number;
		unitPrice: number;
		subtotal: number;
	}[];
}

function billingEntry(
	bill: repo.FuchsenBill,
	items: {
		id: string;
		itemName: string;
		amount: number;
		pricePerItem: number;
		totalPrice: number;
	}[],
): FuchsenBillingEntry {
	return {
		id: bill.id,
		name: bill.userName,
		totalDue: bill.total,
		status: bill.status,
		oldBillingAmount: bill.oldBillingAmount,
		itemsTotal: bill.itemsTotal,
		paidAt: bill.paidAt,
		items: items.map((item) => ({
			id: item.id,
			name: item.itemName,
			quantity: item.amount,
			unitPrice: item.pricePerItem,
			subtotal: item.totalPrice,
		})),
	};
}

/** Every bill period, newest first. */
export async function listBillPeriods({ db }: TenantScope) {
	return repo.listPeriods(db);
}

/** A period's bills by name, each with its items, in one round trip. */
export async function billsForPeriod(
	{ db }: TenantScope,
	billPeriodId: string,
): Promise<FuchsenBillingEntry[]> {
	const [bills, itemsByBill] = await repo.periodBillsWithItems(
		db,
		billPeriodId,
	);
	return bills.map((bill) =>
		billingEntry(bill, itemsByBill.get(bill.id) ?? []),
	);
}

/** The member's own bills (newest first) with their periods and items. */
export async function memberBills(
	{ db }: TenantScope,
	userId: string,
): Promise<
	{ period: repo.FuchsenBillPeriod | null; bill: FuchsenBillingEntry }[]
> {
	const [rows, itemsByBill] = await repo.memberBillsWithItems(db, userId);
	return rows.map(({ bill, period }) => ({
		period,
		bill: billingEntry(bill, itemsByBill.get(bill.id) ?? []),
	}));
}

/**
 * Per-member aggregation of the orders the next run bills: the "Aktuelle
 * Bestellungen" tab (preview of the next billing run).
 */
export async function unbilledByMember({
	db,
}: TenantScope): Promise<FuchsenBillingEntry[]> {
	const orders = await repo.billableOrders(db);

	const byUser = new Map<string, FuchsenBillingEntry>();
	for (const order of orders) {
		const entry = byUser.get(order.userId) ?? {
			id: order.userId,
			name: order.userName,
			totalDue: 0,
			items: [],
		};
		entry.totalDue = addMoney(entry.totalDue, order.total);
		const existing = entry.items.find(
			(i) => i.name === order.itemName && i.unitPrice === order.pricePerUnit,
		);
		if (existing) {
			existing.quantity += order.amount;
			existing.subtotal = addMoney(existing.subtotal, order.total);
		} else {
			entry.items.push({
				id: order.id,
				name: order.itemName,
				quantity: order.amount,
				unitPrice: order.pricePerUnit,
				subtotal: order.total,
			});
		}
		byUser.set(order.userId, entry);
	}

	return Array.from(byUser.values()).sort((a, b) =>
		a.name.localeCompare(b.name),
	);
}

/**
 * Sets a bill's status, together with its orders. A carried bill is settled
 * (and reopened) through the bill it was rolled into; paying a bill pays the
 * bills carried into it, and undoing that payment reopens them as carried.
 */
export async function setBillStatus(
	{ db, now }: TenantScope,
	billId: string,
	newStatus: "Bezahlt" | "Unbezahlt" | "Gestundet",
): Promise<void> {
	const bill = await repo.findBill(db, billId);
	if (!bill) {
		throw new NotFoundError("Rechnung nicht gefunden");
	}
	const refusal = await repo.carriedRefusal(db, bill);
	if (refusal) {
		throw new ConflictError(refusal, "CARRIED_BILL");
	}
	// Paying a paid bill again would move its paidAt away from the bills
	// it settled, and with it the link to them.
	if (bill.status === newStatus) {
		return;
	}

	const cascade =
		newStatus === "Bezahlt"
			? "payCarried"
			: bill.status === "Bezahlt"
				? "reopenSettled"
				: null;
	await repo.setBillStatus(db, bill, newStatus, now(), cascade);
}

/** A period's bills as CSV (semicolon-delimited); no blob storage. */
export async function periodCsv({ db }: TenantScope, billPeriodId: string) {
	const period = await repo.findPeriod(db, billPeriodId);
	if (!period) {
		throw new NotFoundError("Periode nicht gefunden");
	}
	return fuchsenPeriodCsv(period, await repo.periodBills(db, billPeriodId));
}

/**
 * A bill as PDF (base64) for `member`: their own bill, or any bill for the
 * Fuchsenwart and Admins.
 */
export async function billPdf(
	{ db }: TenantScope,
	member: { id: string; roles: readonly string[] },
	billId: string,
) {
	const bill = await repo.findBill(db, billId);
	if (!bill) {
		throw new NotFoundError("Rechnung nicht gefunden");
	}
	if (
		bill.userId !== member.id &&
		!member.roles.some((role) => role === "Fuchs" || role === "Admin")
	) {
		throw new DomainError("Keine Berechtigung", "FORBIDDEN");
	}
	const { period, items, config } = await repo.billDocument(db, bill);
	return renderFuchsenBillPdf({
		bill,
		period,
		items,
		config: config ?? EMPTY_CONFIG,
	});
}

// ─── Payment details ─────────────────────────────────────────────────────────

const EMPTY_CONFIG: repo.FuchsenBillingConfig = {
	id: repo.CONFIG_ID,
	senderName: "",
	senderStreet: "",
	senderCity: "",
	location: "",
	iban: "",
	accountHolder: "",
	paypalBaseUrl: "",
	paymentDueDays: 14,
	updatedAt: null,
	updatedBy: null,
};

export const billingConfigSchema = z.object({
	senderName: z.string().max(255),
	senderStreet: z.string().max(255),
	senderCity: z.string().max(255),
	location: z.string().max(255),
	iban: z.string().max(50),
	accountHolder: z.string().max(255),
	paypalBaseUrl: z
		.string()
		.max(500)
		.refine((v) => v === "" || /^https?:\/\//.test(v), {
			message: "PayPal-Link muss mit http(s):// beginnen",
		}),
	paymentDueDays: z.number().int().min(1).max(90),
});

export type FuchsenBillingConfigInput = z.infer<typeof billingConfigSchema>;

/** The payment details the bills print; empty (14 days) until saved. */
export async function billingConfig({
	db,
}: TenantScope): Promise<repo.FuchsenBillingConfig> {
	return (await repo.findConfig(db)) ?? EMPTY_CONFIG;
}

export async function saveBillingConfig(
	{ db, now }: TenantScope,
	input: FuchsenBillingConfigInput,
	userId: string,
): Promise<void> {
	await repo.saveConfig(db, input, { userId, now: now() });
}
