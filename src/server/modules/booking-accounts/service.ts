// service.ts — the group accounts a drink can be booked on. The Getränkewart
// adds them, pins the common ones as chips on the menu, orders and archives
// them; members book on the active ones.
//
// A name never changes once created: orders store it and billing groups by
// it. Rules on names are in ~/lib/booking-accounts.

import "server-only";

import {
	accountNameProblem,
	type BookingAccountOption,
	normalizeAccountName,
} from "~/lib/booking-accounts";
import { roundToCent } from "~/lib/money";
import {
	ConflictError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

/** What the menu offers: the active accounts in display order. */
export async function activeAccounts({
	db,
}: TenantScope): Promise<BookingAccountOption[]> {
	return (await repo.listAccounts(db))
		.filter((a) => !a.archived)
		.map(({ name, pinned }) => ({ name, pinned }));
}

export type ManagedBookingAccount = {
	id: string;
	name: string;
	pinned: boolean;
	archived: boolean;
	/** Orders on this account the next billing run will bill. */
	unbilledOrders: number;
	unbilledTotal: number;
};

/** Every account with what is booked on it and not billed yet. */
export async function managedAccounts({
	db,
}: TenantScope): Promise<ManagedBookingAccount[]> {
	const [accounts, unbilled] = await Promise.all([
		repo.listAccounts(db),
		repo.unbilledByAccount(db),
	]);
	const byName = new Map(unbilled.map((u) => [u.name, u]));
	return accounts.map((a) => {
		const open = byName.get(a.name);
		return {
			id: a.id,
			name: a.name,
			pinned: a.pinned,
			archived: a.archived,
			unbilledOrders: open?.orders ?? 0,
			unbilledTotal: roundToCent(Number(open?.total ?? 0)),
		};
	});
}

/** Whether `name` is an active account an order may be booked on. */
export async function isBookableAccount(
	{ db }: TenantScope,
	name: string,
): Promise<boolean> {
	return (await repo.findActiveAccountByName(db, name)) !== null;
}

/** A new account at the end of the list. */
export async function addAccount(
	{ db }: TenantScope,
	rawName: string,
	pinned: boolean,
) {
	const name = normalizeAccountName(rawName);
	const accounts = await repo.listAccounts(db);
	const problem = accountNameProblem(
		name,
		accounts.map((a) => a.name),
	);
	if (problem) {
		throw new ValidationError(problem);
	}
	const sortOrder = Math.max(-1, ...accounts.map((a) => a.sortOrder)) + 1;
	await repo.insertAccount(db, { name, pinned, sortOrder });
}

async function requireAccount(db: TenantScope["db"], id: string) {
	const account = await repo.findAccount(db, id);
	if (!account) {
		throw new NotFoundError("Konto nicht gefunden");
	}
	return account;
}

/** Chip on the menu (pinned) or behind "Weitere". */
export async function setPinned(
	{ db }: TenantScope,
	id: string,
	pinned: boolean,
) {
	await requireAccount(db, id);
	await repo.updateAccount(db, id, { pinned });
}

/**
 * Archived accounts disappear from the menu; their orders, open ones
 * included, are billed as before.
 */
export async function setArchived(
	{ db }: TenantScope,
	id: string,
	archived: boolean,
) {
	await requireAccount(db, id);
	await repo.updateAccount(db, id, { archived });
}

/** Swaps the account with its neighbour among the active accounts. */
export async function move(
	{ db }: TenantScope,
	id: string,
	direction: "up" | "down",
) {
	const accounts = await repo.listAccounts(db);
	const active = accounts.filter((a) => !a.archived);
	const index = active.findIndex((a) => a.id === id);
	if (index === -1) {
		throw new NotFoundError("Konto nicht gefunden");
	}
	const other = direction === "up" ? index - 1 : index + 1;
	if (other < 0 || other >= active.length) {
		return;
	}
	const ids = active.map((a) => a.id);
	[ids[index], ids[other]] = [ids[other] as string, ids[index] as string];
	// Archived accounts keep their place after the active ones.
	const archived = accounts.filter((a) => a.archived).map((a) => a.id);
	await repo.saveOrder(db, [...ids, ...archived]);
}

/** Only an account nothing was ever booked on (a typo); others are archived. */
export async function deleteAccount({ db }: TenantScope, id: string) {
	const account = await requireAccount(db, id);
	if ((await repo.ordersOn(db, account.name)) > 0) {
		throw new ConflictError(
			`Auf „${account.name}“ wurde schon gebucht, es kann nur archiviert werden.`,
		);
	}
	await repo.deleteAccount(db, id);
}
