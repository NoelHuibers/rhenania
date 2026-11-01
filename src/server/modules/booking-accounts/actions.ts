"use server";

// actions.ts — the booking accounts: every member reads the active ones for
// the menu, the Getränkewart manages them in the Kasse.

import { z } from "zod";
import { ROLES, requireCaller } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { scopeOf } from "~/server/lib/tenant-scope";
import * as accounts from "./service";

export type { ManagedBookingAccount } from "./service";

/** The active accounts, for the menu and the booking form. */
export async function getBookingAccounts() {
	const { tenantId } = await requireCaller();
	return accounts.activeAccounts(await scopeOf(tenantId));
}

/** Every account with its unbilled orders, for the Getränkewart. */
export async function getManagedBookingAccounts() {
	const { tenantId } = await requireCaller(ROLES.getraenke);
	return accounts.managedAccounts(await scopeOf(tenantId));
}

// The menu shows the accounts, so it is revalidated with every change.
const manage = {
	roles: ROLES.getraenke,
	revalidate: ["/trinken", "/getraenkewart"],
} as const;

export const addBookingAccount = defineAction(
	{
		...manage,
		schema: z.tuple([z.string().max(255), z.boolean()]),
		errorMessage: "Konto konnte nicht angelegt werden",
	},
	async ([name, pinned], { tenant }) =>
		accounts.addAccount(tenant, name, pinned),
);

export const setBookingAccountPinned = defineAction(
	{ ...manage, schema: z.tuple([z.string(), z.boolean()]) },
	async ([id, pinned], { tenant }) => accounts.setPinned(tenant, id, pinned),
);

export const setBookingAccountArchived = defineAction(
	{ ...manage, schema: z.tuple([z.string(), z.boolean()]) },
	async ([id, archived], { tenant }) =>
		accounts.setArchived(tenant, id, archived),
);

export const moveBookingAccount = defineAction(
	{ ...manage, schema: z.tuple([z.string(), z.enum(["up", "down"])]) },
	async ([id, direction], { tenant }) => accounts.move(tenant, id, direction),
);

export const deleteBookingAccount = defineAction(
	{ ...manage, schema: z.tuple([z.string()]) },
	async ([id], { tenant }) => accounts.deleteAccount(tenant, id),
);
