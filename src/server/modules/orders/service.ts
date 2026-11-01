// service.ts — drink orders: booking, a member's orders, the unbilled
// orders and the Literboard (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. Grouping the unbilled orders and the
// Literboard's chart are pure (domain/orders).

import "server-only";

import { after } from "next/server";
import { z } from "zod";
import { isValidOrderAmount, MAX_ORDER_AMOUNT } from "~/lib/drink-order";
import { MY_ORDERS_PAGE_SIZE } from "~/lib/my-orders";
import { orderTotal, unitPriceFor } from "~/lib/pricing";
import {
	type ChartConfig,
	type ConsumptionLinePoint,
	changePercent,
	consumptionChart,
	monthBoundsLast6,
	round2,
} from "~/server/domain/orders/consumption";
import {
	type BillingEntry,
	groupOpenOrders,
} from "~/server/domain/orders/open-orders";
import type { Member } from "~/server/lib/authz";
import { ActionError } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import { checkAndUnlockAchievements } from "~/server/modules/achievements/tracking";
import { isBookableAccount } from "~/server/modules/booking-accounts/service";
import { drinkPricing } from "~/server/modules/getraenkekasse/service";
import * as repo from "./repo";

// ─── Booking ─────────────────────────────────────────────────────────────────

const INVALID_AMOUNT = `Bitte eine ganze Anzahl zwischen 1 und ${MAX_ORDER_AMOUNT} wählen`;

export const createOrderSchema = z.object({
	drinkId: z.string(),
	// Display values from the menu (name, price, total) are accepted but
	// never trusted: the server recomputes them from the drinks table.
	drinkName: z.string().optional(),
	pricePerUnit: z.number().optional(),
	total: z.number().optional(),
	amount: z.number({ error: INVALID_AMOUNT }),
	bookingFor: z.string().nullable(),
	targetUserId: z.string().optional(),
	targetUserName: z.string().optional(),
});

/** Books a drink for the caller, or (Admin) for another member. */
export async function createOrder(
	tenant: TenantScope,
	user: Member,
	orderData: z.output<typeof createOrderSchema>,
): Promise<{ orderId: string | undefined }> {
	const { db } = tenant;
	const adminId = user.id;

	const adminName = await repo.userName(db, adminId);
	if (!adminName) {
		throw new ActionError("Dein Name konnte nicht ermittelt werden");
	}

	// Faxe orders always go on the AHV account.
	const isFaxe = user.roles.includes("Faxe");
	const bookingFor = isFaxe ? "AHV" : orderData.bookingFor;

	// Admin booking: only admins may book for somebody else.
	const isBookingForOther =
		!!orderData.targetUserId && orderData.targetUserId !== adminId;
	if (isBookingForOther) {
		if (!user.roles.includes("Admin")) {
			throw new ActionError(
				"Nur Admins dürfen für andere Mitglieder buchen",
				"FORBIDDEN",
			);
		}
		if (!orderData.targetUserName) {
			throw new ActionError("Für wen gebucht wird, fehlt", "INVALID_INPUT");
		}
	}
	const userId = isBookingForOther
		? (orderData.targetUserId ?? adminId)
		: adminId;
	const userName = isBookingForOther
		? (orderData.targetUserName ?? adminName)
		: adminName;
	const bookedByAdminId = isBookingForOther ? adminId : null;
	const bookedByAdminName = isBookingForOther ? adminName : null;

	if (!isValidOrderAmount(orderData.amount)) {
		throw new ActionError(INVALID_AMOUNT, "INVALID_INPUT");
	}
	// Faxe always book on AHV, whatever the Getränkewart did to that account.
	if (
		!isFaxe &&
		bookingFor !== null &&
		!(await isBookableAccount(tenant, bookingFor))
	) {
		throw new ActionError("Unbekanntes Abrechnungskonto", "INVALID_INPUT");
	}

	// The server decides the price: purchase price from the drinks table,
	// plus the tenant's markup on personal orders when that feature is on.
	// Client-sent prices are ignored, so a stale menu can't book an old one.
	const drink = await repo.drinkForOrder(db, orderData.drinkId);
	if (!drink) {
		throw new NotFoundError("Getränk nicht gefunden");
	}

	const pricing = await drinkPricing(tenant);
	const pricePerUnit = unitPriceFor(
		drink.price,
		pricing.markupPercent,
		bookingFor,
	);
	const total = orderTotal(
		pricePerUnit,
		orderData.amount,
		pricing.markupPercent,
	);

	const orderId = await repo.insertOrder(db, {
		userId,
		userName,
		drinkId: drink.id,
		drinkName: drink.name,
		amount: orderData.amount,
		pricePerUnit,
		costPerUnit: pricing.enabled ? drink.price : null,
		total,
		bookingFor,
		bookedByAdminId,
		bookedByAdminName,
	});

	// Achievements run after the response, against this Corps explicitly.
	const achievementContext = {
		drinkName: drink.name,
		drinkId: drink.id,
		amount: orderData.amount,
		total,
		bookingFor,
	};
	after(() =>
		checkAndUnlockAchievements(
			tenant,
			userId,
			"order_created",
			achievementContext,
		),
	);

	return { orderId };
}

// ─── A member's orders (#24) ─────────────────────────────────────────────────

export const ordersPageSchema = z.object({
	page: z.number().int().min(1).max(100_000).default(1),
	outOfBillOnly: z.boolean().default(false),
	/** Instants (ISO), so the browser decides where its day starts and ends. */
	from: z.iso.datetime().nullish(),
	to: z.iso.datetime().nullish(),
});

export type MyOrdersQuery = z.input<typeof ordersPageSchema>;

export type MyOrder = {
	id: string;
	createdAt: Date;
	drinkName: string;
	amount: number;
	total: number;
	inBill: boolean;
};

export type MyOrdersPage = {
	orders: MyOrder[];
	/** Orders matching the filters, across all pages. */
	total: number;
	page: number;
	pageSize: number;
};

/**
 * One page of the member's own orders, newest first. The page and the
 * matching count travel in one round trip; the list is never loaded whole.
 */
export async function myOrdersPage(
	{ db }: TenantScope,
	userId: string,
	query: z.output<typeof ordersPageSchema>,
): Promise<MyOrdersPage> {
	const { page, outOfBillOnly, from, to } = query;
	const pageSize = MY_ORDERS_PAGE_SIZE;
	const { rows, total } = await repo.orderPage(
		db,
		{
			userId,
			outOfBillOnly,
			from: from ? new Date(from) : null,
			to: to ? new Date(to) : null,
		},
		{ limit: pageSize, offset: (page - 1) * pageSize },
	);
	return { orders: rows, total, page, pageSize };
}

// ─── The unbilled orders ─────────────────────────────────────────────────────

/** The unbilled orders per member and per booking account. */
export async function openOrders({ db }: TenantScope): Promise<BillingEntry[]> {
	return groupOpenOrders(await repo.unbilledOrders(db));
}

// ─── The Literboard ──────────────────────────────────────────────────────────

export type LeaderboardEntry = {
	userId: string;
	userName: string;
	avatar: string | null;
	liters: number;
	prevLiters: number;
	changePct: number | null;
};

/**
 * The members who drank most in the last six months: their six-month
 * litres, their litres of the last 31 days (`prevLiters`) and the change
 * from the 31 days before.
 */
export async function leaderboard(
	{ db }: TenantScope,
	limit = 10,
): Promise<LeaderboardEntry[]> {
	const rows = await repo.topDrinkers(db, limit);
	return rows.map((r) => {
		const liters = round2((r.liters ?? 0) as number);
		const lastThirtyOneDaysLiters = round2(
			(r.lastThirtyOneDaysLiters ?? 0) as number,
		);
		const prevLiters = round2((r.prevLiters ?? 0) as number);
		return {
			userId: r.userId,
			userName: r.userName,
			avatar: r.avatar ?? null,
			liters, // Still showing 6-month total for leaderboard ranking
			prevLiters: lastThirtyOneDaysLiters, // Now showing last 31 days consumption
			// Change from previous 31 days to last 31 days
			changePct: changePercent(lastThirtyOneDaysLiters, prevLiters),
		};
	});
}

/** The change of personal litres from the 31 days before to the last 31. */
export async function monthlyGrowthRate({
	db,
}: TenantScope): Promise<number | null> {
	const row = await repo.litresLastTwoMonths(db);
	return changePercent(
		round2(Number(row?.lastThirtyOneDaysLiters ?? 0)),
		round2(Number(row?.prevThirtyOneDaysLiters ?? 0)),
	);
}

/** Litres ordered in the last six months. */
export async function totalConsumption({ db }: TenantScope): Promise<number> {
	const rows = await repo.litresLastSixMonths(db);
	return rows.reduce((sum, row) => sum + (row.totalLiters ?? 0), 0);
}

/** Litres per Berlin month and drink for the last six months, as a chart. */
export async function consumptionByDrink(tenant: TenantScope): Promise<{
	data: ConsumptionLinePoint[];
	config: ChartConfig;
}> {
	const bounds = monthBoundsLast6(tenant.now());
	const months = bounds.slice(0, -1);
	const upperBound = bounds[bounds.length - 1] ?? 0;
	const rows = await repo.litresPerMonthAndDrink(tenant.db, months, upperBound);
	return consumptionChart(months, rows);
}
