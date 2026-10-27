// Runtime authorization matrix: privileged actions reject plain members,
// members of another Corps and anonymous callers before touching data.
// (The static test in authz-guards.test.ts makes sure every action has a
// guard at all; this one checks the guards pick the right people.)

import { describe, expect, test, vi } from "vitest";

import {
	assignUserRole,
	deleteUser,
	updateUser,
} from "~/server/actions/admin/admin";
import { saveHomepageImage } from "~/server/actions/bilder/homepageImages";
import {
	createNewBilling,
	updateBillStatus,
} from "~/server/actions/billings/billings";
import { getCurrentOrders } from "~/server/actions/currentOrders";
import { addDrink, deleteDrink } from "~/server/actions/drinks";
import { createEvent } from "~/server/actions/events/events";
import { createRecurringEvent } from "~/server/actions/events/recurring";
import { getEventRsvps } from "~/server/actions/events/rsvp";
import { addFuchsenItem } from "~/server/actions/fuchsenladen/items";
import { getFuchsenBillsByUser } from "~/server/actions/fuchsenladen/orders";
import {
	addBankEntry,
	getKasseSummary,
	setPfandWert,
} from "~/server/actions/getraenkewart/kasse";
import {
	closeInventoryAndBill,
	saveInventoryCount,
} from "~/server/actions/inventur/inventur";
import { createUser as inviteUser } from "~/server/actions/newuser/users";
import { upsertSemesterConfig } from "~/server/actions/semesterprogramm/semesterConfig";
import { createVenue } from "~/server/actions/venues";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	signOut,
	switchTenant,
} from "./harness";

vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ del: vi.fn(), put: vi.fn() }));

setupTestDatabases();

const anyArg = {} as never;

// [name, call, roles that are allowed]
const PRIVILEGED: Array<[string, () => Promise<unknown>]> = [
	["admin.updateUser", () => updateUser("x", { name: "y" })],
	["admin.deleteUser", () => deleteUser("x")],
	["admin.assignUserRole", () => assignUserRole("x", "y")],
	["users.createUser (invite)", () => inviteUser(anyArg)],
	["billings.createNewBilling", () => createNewBilling()],
	["billings.updateBillStatus", () => updateBillStatus("x", "Bezahlt")],
	["kasse.getKasseSummary", () => getKasseSummary()],
	[
		"kasse.addBankEntry",
		() => addBankEntry({ amount: 1, description: "x", date: new Date() }),
	],
	["kasse.setPfandWert", () => setPfandWert(1)],
	["inventur.saveInventoryCount", () => saveInventoryCount([])],
	["inventur.closeInventoryAndBill", () => closeInventoryAndBill([])],
	["drinks.addDrink", () => addDrink(anyArg)],
	["drinks.deleteDrink", () => deleteDrink("x")],
	["events.createEvent", () => createEvent(anyArg)],
	["recurring.createRecurringEvent", () => createRecurringEvent(anyArg)],
	["rsvp.getEventRsvps (emails)", () => getEventRsvps("x")],
	["venues.createVenue", () => createVenue("x", "y")],
	["semesterConfig.upsertSemesterConfig", () => upsertSemesterConfig(anyArg)],
	["fuchsen.addFuchsenItem", () => addFuchsenItem(anyArg)],
	["fuchsen.getFuchsenBillsByUser", () => getFuchsenBillsByUser()],
	["bilder.saveHomepageImage", () => saveHomepageImage(anyArg)],
];

async function expectDenied(call: () => Promise<unknown>) {
	let outcome: unknown;
	try {
		outcome = await call();
	} catch (error) {
		expect((error as Error).name).toBe("AuthzError");
		return;
	}
	throw new Error(`expected a rejection, got ${JSON.stringify(outcome)}`);
}

describe("privileged actions", () => {
	test.each(PRIVILEGED)("%s rejects a plain member", async (_name, call) => {
		await createTenant();
		signInAs(await createUser({ roles: ["Hausbewohner"] }));
		await expectDenied(call);
	});

	test.each(
		PRIVILEGED,
	)("%s rejects an Admin of another Corps", async (_name, call) => {
		const home = await createTenant();
		const other = await createTenant();
		signInAs(
			await createUser({
				roles: ["Admin", "Getränkewart", "Fuchs", "Fotowart"],
				tenantId: other.id,
			}),
		);
		switchTenant(home);
		await expectDenied(call);
	});

	test.each(PRIVILEGED)("%s rejects anonymous callers", async (_name, call) => {
		await createTenant();
		signOut();
		await expectDenied(call);
	});
});

describe("member-level reads", () => {
	test("non-members and anonymous callers can't read a Corps' orders", async () => {
		const home = await createTenant();
		const other = await createTenant();
		signInAs(await createUser({ tenantId: other.id }));
		switchTenant(home);
		await expectDenied(() => getCurrentOrders());
		signOut();
		await expectDenied(() => getCurrentOrders());
	});
});
