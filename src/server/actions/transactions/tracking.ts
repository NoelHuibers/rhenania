// transactions/tracking.ts — the order list behind /transactions.
"use server";

import {
	and,
	desc,
	eq,
	isNotNull,
	isNull,
	ne,
	or,
	type SQL,
	sql,
} from "drizzle-orm";
import { z } from "zod";
import { orders } from "~/server/db/schema";
import { defineAction } from "~/server/lib/define-action";

/**
 * A case-insensitive GLOB pattern for "contains `term`". SQLite's LIKE and
 * lower() only fold ASCII, so "özdemir" would never match "Özdemir"; GLOB is
 * case-sensitive but supports character classes, so every letter becomes
 * `[öÖ]`. GLOB's own wildcards in the term are matched literally.
 */
function containsPattern(term: string): string {
	let pattern = "";
	for (const char of term.normalize("NFC")) {
		const lower = char.toLowerCase();
		const upper = char.toUpperCase();
		if ("*?[".includes(char)) {
			pattern += `[${char}]`;
		} else if (
			lower !== upper &&
			[...lower].length === 1 &&
			[...upper].length === 1
		) {
			pattern += `[${lower}${upper}]`;
		} else {
			pattern += char;
		}
	}
	return `*${pattern}*`;
}

function searchCondition(search: string) {
	const pattern = containsPattern(search.trim());
	return or(
		sql`${orders.userName} GLOB ${pattern}`,
		sql`${orders.drinkName} GLOB ${pattern}`,
		sql`${orders.bookingFor} GLOB ${pattern}`,
	);
}

const transactionFiltersSchema = z.object({
	search: z.string().optional(),
	billStatus: z.enum(["all", "billed", "not_billed"]).optional(),
	purposeFilter: z.enum(["all", "personal", "events"]).optional(),
	limit: z.number().int().min(0).optional(),
	offset: z.number().int().min(0).optional(),
});

export type TransactionFilters = z.input<typeof transactionFiltersSchema>;

/** The WHERE clause for `filters` (search, bill status, purpose). */
function filterCondition({
	search = "",
	billStatus = "all",
	purposeFilter = "all",
}: TransactionFilters) {
	const conditions: Array<SQL | undefined> = [];

	if (search.trim()) {
		conditions.push(searchCondition(search));
	}

	if (billStatus === "billed") {
		conditions.push(eq(orders.inBill, true));
	} else if (billStatus === "not_billed") {
		conditions.push(eq(orders.inBill, false));
	}

	if (purposeFilter === "personal") {
		conditions.push(or(isNull(orders.bookingFor), eq(orders.bookingFor, "")));
	} else if (purposeFilter === "events") {
		conditions.push(
			and(isNotNull(orders.bookingFor), ne(orders.bookingFor, "")),
		);
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}

/** The Kassenwart's order list, newest first, `limit` rows from `offset`. */
export const getTransactions = defineAction(
	{
		schema: z.tuple([transactionFiltersSchema.optional()]),
		errorMessage: "Fehler beim Abrufen der Transaktionen",
	},
	async ([filters = {}], { tenant }) => {
		const { limit = 50, offset = 0 } = filters;
		return tenant.db
			.select({
				id: orders.id,
				userId: orders.userId,
				userName: orders.userName,
				drinkId: orders.drinkId,
				drinkName: orders.drinkName,
				amount: orders.amount,
				pricePerUnit: orders.pricePerUnit,
				total: orders.total,
				inBill: orders.inBill,
				bookingFor: orders.bookingFor,
				bookedByAdminName: orders.bookedByAdminName,
				createdAt: orders.createdAt,
			})
			.from(orders)
			.where(filterCondition(filters))
			.orderBy(desc(orders.createdAt))
			.limit(limit)
			.offset(offset);
	},
);

/** How many orders match `filters` (for the total shown above the list). */
export const getTransactionCount = defineAction(
	{
		schema: z.tuple([transactionFiltersSchema.optional()]),
		errorMessage: "Fehler beim Zählen der Transaktionen",
	},
	async ([filters = {}], { tenant }) => {
		const [row] = await tenant.db
			.select({ count: sql<number>`count(*)` })
			.from(orders)
			.where(filterCondition(filters));
		return row?.count ?? 0;
	},
);
