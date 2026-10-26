// lib/actions/transactions.ts
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
import { db } from "~/server/db";
import { orders } from "~/server/db/schema";
import { requireMember } from "~/server/lib/authz";

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

export interface TransactionFilters {
	search?: string;
	billStatus?: "all" | "billed" | "not_billed";
	purposeFilter?: "all" | "personal" | "events";
	limit?: number;
	offset?: number;
}

export async function getTransactions(filters: TransactionFilters = {}) {
	await requireMember();
	try {
		const {
			search = "",
			billStatus = "all",
			purposeFilter = "all",
			limit = 50,
			offset = 0,
		} = filters;

		// Build where conditions
		const conditions: Array<SQL | undefined> = [];

		// Search filter
		if (search?.trim()) {
			conditions.push(searchCondition(search));
		}

		// Bill status filter
		if (billStatus === "billed") {
			conditions.push(eq(orders.inBill, true));
		} else if (billStatus === "not_billed") {
			conditions.push(eq(orders.inBill, false));
		}

		// Purpose filter
		if (purposeFilter === "personal") {
			conditions.push(or(isNull(orders.bookingFor), eq(orders.bookingFor, "")));
		} else if (purposeFilter === "events") {
			conditions.push(
				and(isNotNull(orders.bookingFor), ne(orders.bookingFor, "")),
			);
		}

		// Combine conditions
		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		// Execute query
		const transactions = await db
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
			.where(whereClause)
			.orderBy(desc(orders.createdAt))
			.limit(limit)
			.offset(offset);

		// Convert timestamps to Date objects for the frontend
		const formattedTransactions = transactions.map((transaction) => {
			// The database already returns Date objects, no conversion needed
			return {
				...transaction,
				createdAt: transaction.createdAt, // Already a Date object
			};
		});

		return {
			success: true,
			data: formattedTransactions,
			total: formattedTransactions.length,
		};
	} catch (error) {
		console.error("Error fetching transactions:", error);
		return {
			success: false,
			error: "Failed to fetch transactions",
			data: [],
			total: 0,
		};
	}
}

// Server action to get transaction count (useful for pagination)
export async function getTransactionCount(filters: TransactionFilters = {}) {
	await requireMember();
	try {
		const { search = "", billStatus = "all", purposeFilter = "all" } = filters;

		// Build where conditions (same as above)
		const conditions: Array<SQL | undefined> = [];

		if (search?.trim()) {
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

		const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

		const countResult = await db
			.select({ count: sql<number>`count(*)` })
			.from(orders)
			.where(whereClause);

		return {
			success: true,
			count: countResult[0]?.count ?? 0,
		};
	} catch (error) {
		console.error("Error counting transactions:", error);
		return {
			success: false,
			count: 0,
		};
	}
}

// Server action to get unique purposes for filter dropdown
export async function getUniquePurposes() {
	await requireMember();
	try {
		const purposes = await db
			.select({ bookingFor: orders.bookingFor })
			.from(orders)
			.where(and(isNotNull(orders.bookingFor), ne(orders.bookingFor, "")))
			.groupBy(orders.bookingFor)
			.orderBy(orders.bookingFor);

		return {
			success: true,
			data: purposes
				.map((p) => p.bookingFor)
				.filter(
					(purpose): purpose is string => purpose !== null && purpose !== "",
				),
		};
	} catch (error) {
		console.error("Error fetching unique purposes:", error);
		return {
			success: false,
			data: [],
		};
	}
}
