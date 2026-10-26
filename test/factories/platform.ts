// Factories for platform tests: superadmins, tenant auth config, OAuth
// accounts, extra domains, bills and homepage images.

import { randomUUID } from "node:crypto";

import {
	accounts,
	superAdmins,
	tenantAuthConfig,
	tenantDomains,
} from "~/server/db/control-schema";
import {
	billItems,
	billPeriods,
	bills,
	homepageImages,
	kontos,
} from "~/server/db/schema";
import { requireControl, requireTenant, testState } from "../state";

let counter = 0;
const next = () => ++counter;

/** Grants platform superadmin to an existing identity. */
export async function grantSuperAdmin(userId: string) {
	await requireControl().db.insert(superAdmins).values({ userId });
}

export async function setAuthConfig(
	tenantId: string,
	values: Partial<typeof tenantAuthConfig.$inferInsert> = {},
) {
	await requireControl()
		.db.insert(tenantAuthConfig)
		.values({ tenantId, ...values })
		.onConflictDoUpdate({
			target: tenantAuthConfig.tenantId,
			set: { ...values, updatedAt: new Date() },
		});
}

/** Complete Microsoft config, so the tenant gets an OAuth provider. */
export function microsoftConfig(n = next()) {
	return {
		microsoftEnabled: true,
		azureClientId: `client-${n}`,
		azureClientSecret: `secret-${n}`,
		azureTenantId: `azure-tenant-${n}`,
	};
}

export async function addDomain(
	tenantId: string,
	hostname: string,
	isPrimary = false,
) {
	const [row] = await requireControl()
		.db.insert(tenantDomains)
		.values({ tenantId, hostname, isPrimary })
		.returning();
	if (!row) {
		throw new Error("Could not create domain");
	}
	return row;
}

export async function createAccount(
	userId: string,
	providerId: string,
	values: Partial<typeof accounts.$inferInsert> = {},
) {
	const [row] = await requireControl()
		.db.insert(accounts)
		.values({ accountId: randomUUID(), providerId, userId, ...values })
		.returning();
	if (!row) {
		throw new Error("Could not create account");
	}
	return row;
}

export async function createBill(
	opts: {
		userId: string;
		userName?: string;
		billNumber?: string;
		status?: (typeof bills.$inferInsert)["status"];
		drinksTotal?: number;
		fees?: number;
		oldBillingAmount?: number;
		createdAt?: Date;
		updatedAt?: Date;
		items?: Array<{ drinkName: string; amount: number; price: number }>;
	},
	tenantId = testState.tenantId,
) {
	const db = requireTenant(tenantId).db;
	const [period] = await db
		.insert(billPeriods)
		.values({ billNumber: opts.billNumber ?? `KW-${next()}-26` })
		.returning();
	if (!period) {
		throw new Error("Could not create bill period");
	}

	const items = opts.items ?? [];
	const drinksTotal =
		opts.drinksTotal ?? items.reduce((s, i) => s + i.amount * i.price, 0);
	const fees = opts.fees ?? 0;
	const old = opts.oldBillingAmount ?? 0;
	const [bill] = await db
		.insert(bills)
		.values({
			billPeriodId: period.id,
			userId: opts.userId,
			userName: opts.userName ?? "Test User",
			status: opts.status ?? "Unbezahlt",
			drinksTotal,
			fees,
			oldBillingAmount: old,
			total: drinksTotal + fees + old,
			...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
			// Drizzle fills `updatedAt` with "now" on insert unless given.
			...(opts.updatedAt || opts.createdAt
				? { updatedAt: opts.updatedAt ?? opts.createdAt }
				: {}),
		})
		.returning();
	if (!bill) {
		throw new Error("Could not create bill");
	}

	for (const item of items) {
		await db.insert(billItems).values({
			billId: bill.id,
			drinkName: item.drinkName,
			amount: item.amount,
			pricePerDrink: item.price,
			totalPricePerDrink: item.amount * item.price,
		});
	}
	return { bill, period };
}

export async function createHomepageImage(
	values: Partial<typeof homepageImages.$inferInsert> & { section: string },
	tenantId = testState.tenantId,
) {
	const n = next();
	const [row] = await requireTenant(tenantId)
		.db.insert(homepageImages)
		.values({
			imageUrl: `https://store.public.blob.vercel-storage.com/img-${n}.jpg`,
			imageName: `img-${n}.jpg`,
			...values,
		})
		.returning();
	if (!row) {
		throw new Error("Could not create homepage image");
	}
	return row;
}

export async function createKonto(
	values: Partial<typeof kontos.$inferInsert> & { kasseType: string },
	tenantId = testState.tenantId,
) {
	const [row] = await requireTenant(tenantId)
		.db.insert(kontos)
		.values({
			iban: "DE89 3704 0044 0532 0130 00",
			bic: "COBADEFFXXX",
			bankName: "Testbank",
			...values,
		})
		.returning();
	if (!row) {
		throw new Error("Could not create konto");
	}
	return row;
}
