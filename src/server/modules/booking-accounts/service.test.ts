import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { bookingAccounts } from "~/server/db/schema";
import { createOrderRow } from "../../../../test/factories/billing";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import {
	addBookingAccount,
	deleteBookingAccount,
	getBookingAccounts,
	getManagedBookingAccounts,
	moveBookingAccount,
	setBookingAccountArchived,
	setBookingAccountPinned,
} from "./actions";
import { activeAccounts, isBookableAccount } from "./service";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.restoreAllMocks();
});

async function signInWart() {
	await createTenant();
	const wart = await createUser({ name: "Wart", roles: ["Getränkewart"] });
	signInAs(wart);
	return wart;
}

async function idOf(name: string) {
	const all = await getManagedBookingAccounts();
	const account = all.find((a) => a.name === name);
	if (!account) {
		throw new Error(`no account ${name}`);
	}
	return account.id;
}

const names = async () => (await getBookingAccounts()).map((a) => a.name);

describe("booking accounts", () => {
	test("a new tenant has the accounts that used to be hard-coded", async () => {
		await createTenant();

		expect(await activeAccounts(testScope())).toEqual([
			{ name: "CC", pinned: true },
			{ name: "AKN", pinned: true },
			{ name: "CBesuch", pinned: true },
			{ name: "AHV", pinned: false },
			{ name: "RC", pinned: false },
			{ name: "SC", pinned: false },
			{ name: "Stiftungsfest", pinned: false },
			{ name: "Nikolausbowle", pinned: false },
		]);
	});

	test("the Getränkewart adds an account at the end, normalized", async () => {
		await signInWart();

		expect(await addBookingAccount("  Kneipe   mit Hassia ", true)).toEqual({
			ok: true,
			data: undefined,
		});

		const all = await getBookingAccounts();
		expect(all.at(-1)).toEqual({ name: "Kneipe mit Hassia", pinned: true });
		expect(await isBookableAccount(testScope(), "Kneipe mit Hassia")).toBe(
			true,
		);
	});

	test("names that would share a group bill are refused, archived ones included", async () => {
		await signInWart();
		await setBookingAccountArchived(await idOf("RC"), true);

		expect(await addBookingAccount("cbesuch", false)).toMatchObject({
			ok: false,
			error: "Das Konto „CBesuch“ gibt es schon.",
		});
		expect(await addBookingAccount("rc", false)).toMatchObject({ ok: false });
		expect(await addBookingAccount("Privat", false)).toMatchObject({
			ok: false,
		});
		expect(await addBookingAccount("   ", false)).toMatchObject({ ok: false });
	});

	test("members may read the accounts but not change them", async () => {
		await createTenant();
		signInAs(await createUser());

		expect(await names()).toContain("CBesuch");
		expect(await addBookingAccount("Neu", true)).toMatchObject({
			ok: false,
			code: "FORBIDDEN",
		});
		await expect(getManagedBookingAccounts()).rejects.toThrow();
	});

	test("pinning moves an account between the chips and Weitere", async () => {
		await signInWart();

		await setBookingAccountPinned(await idOf("CBesuch"), false);
		await setBookingAccountPinned(await idOf("Stiftungsfest"), true);

		const pinned = (await getBookingAccounts())
			.filter((a) => a.pinned)
			.map((a) => a.name);
		expect(pinned).toEqual(["CC", "AKN", "Stiftungsfest"]);
	});

	test("archived accounts leave the menu and can no longer be booked", async () => {
		await signInWart();
		const id = await idOf("CBesuch");

		await setBookingAccountArchived(id, true);
		expect(await names()).not.toContain("CBesuch");
		expect(await isBookableAccount(testScope(), "CBesuch")).toBe(false);

		await setBookingAccountArchived(id, false);
		expect(await names()).toContain("CBesuch");
	});

	test("moving swaps an account with its active neighbour", async () => {
		await signInWart();
		await setBookingAccountArchived(await idOf("AKN"), true);

		await moveBookingAccount(await idOf("CBesuch"), "up");
		expect((await names()).slice(0, 2)).toEqual(["CBesuch", "CC"]);

		// Already first: nothing happens.
		await moveBookingAccount(await idOf("CBesuch"), "up");
		expect((await names()).slice(0, 2)).toEqual(["CBesuch", "CC"]);

		await moveBookingAccount(await idOf("Nikolausbowle"), "down");
		expect((await names()).at(-1)).toBe("Nikolausbowle");
	});

	test("only an account nothing was booked on can be deleted", async () => {
		const wart = await signInWart();
		await addBookingAccount("Tippfehler", false);
		await createOrderRow({ user: wart, bookingFor: "SC", inBill: true });

		expect(await deleteBookingAccount(await idOf("Tippfehler"))).toEqual({
			ok: true,
			data: undefined,
		});
		expect(await deleteBookingAccount(await idOf("SC"))).toMatchObject({
			ok: false,
			code: "CONFLICT",
		});
		const rows = await tenantDb().select().from(bookingAccounts);
		expect(rows.map((r) => r.name)).toContain("SC");
		expect(rows.map((r) => r.name)).not.toContain("Tippfehler");
	});

	test("the Getränkewart sees what is booked on each account and not billed yet", async () => {
		const wart = await signInWart();
		const drink = await createDrink({ price: 1.5 });
		const order = { user: wart, drink, bookingFor: "CC" };
		await createOrderRow({ ...order, amount: 2 });
		await createOrderRow({ ...order, amount: 1 });
		await createOrderRow({ ...order, inBill: true });
		await createOrderRow({ ...order, bookingFor: null });

		const all = await getManagedBookingAccounts();
		expect(all.find((a) => a.name === "CC")).toMatchObject({
			unbilledOrders: 2,
			unbilledTotal: 4.5,
		});
		expect(all.find((a) => a.name === "AKN")).toMatchObject({
			unbilledOrders: 0,
			unbilledTotal: 0,
		});
	});
});
