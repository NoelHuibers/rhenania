import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { describe, expect, test, vi } from "vitest";

import { fuchsenItems } from "~/server/db/schema";
import {
	createFuchsenItem,
	createFuchsenOrder,
} from "../../../../test/factories/fuchsenladen";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	addFuchsenItem,
	deleteFuchsenItem,
	getFuchsenItems,
	getFuchsenItemsForMenu,
	toggleFuchsenItemAvailability,
	updateFuchsenItem,
} from "./items";

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

setupTestDatabases();

const OLD_PIC = "https://blob.example/fuchsen/old.png";
const NEW_PIC = "https://blob.example/fuchsen/new.png";

async function asFuchsenwart() {
	await createTenant();
	signInAs(await createUser({ roles: ["Fuchs"] }));
}

async function itemRow(id: string) {
	const [row] = await tenantDb()
		.select()
		.from(fuchsenItems)
		.where(eq(fuchsenItems.id, id));
	return row;
}

describe("addFuchsenItem", () => {
	test("stores a new item and lists it", async () => {
		await asFuchsenwart();

		const result = await addFuchsenItem({
			name: "Mars",
			price: 1.2,
			description: "",
			pictureUrl: NEW_PIC,
			isCurrentlyAvailable: true,
		});

		expect(result).toMatchObject({ success: true });
		expect(await getFuchsenItems()).toEqual([
			expect.objectContaining({
				name: "Mars",
				price: 1.2,
				description: null,
				picture: NEW_PIC,
				isCurrentlyAvailable: true,
			}),
		]);
	});

	test.each([
		{ name: "", price: 1 },
		{ name: "Mars", price: 0 },
		{ name: "Mars", price: 1000 },
	])("rejects invalid input %o and writes nothing", async (input) => {
		await asFuchsenwart();

		const result = await addFuchsenItem({
			...input,
			isCurrentlyAvailable: true,
		});

		expect(result).toMatchObject({
			success: false,
			error: "Validierungsfehler",
		});
		expect(await tenantDb().select().from(fuchsenItems)).toHaveLength(0);
	});
});

describe("updateFuchsenItem", () => {
	test("updates the given fields only", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem({
			name: "Mars",
			price: 1,
			description: "Riegel",
		});

		const result = await updateFuchsenItem(item.id, { price: 1.5 });

		expect(result).toMatchObject({ success: true });
		expect(await itemRow(item.id)).toMatchObject({
			name: "Mars",
			price: 1.5,
			description: "Riegel",
		});
	});

	test("replacing the picture deletes the old blob", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem({ picture: OLD_PIC });

		await updateFuchsenItem(item.id, { pictureUrl: NEW_PIC });

		expect(del).toHaveBeenCalledExactlyOnceWith(OLD_PIC);
		expect((await itemRow(item.id))?.picture).toBe(NEW_PIC);
	});

	test("keeps the blob when the picture is unchanged", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem({ picture: OLD_PIC });

		await updateFuchsenItem(item.id, { pictureUrl: OLD_PIC, name: "Neu" });

		expect(del).not.toHaveBeenCalled();
		expect(await itemRow(item.id)).toMatchObject({
			name: "Neu",
			picture: OLD_PIC,
		});
	});

	test("still saves when deleting the old blob fails", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem({ picture: OLD_PIC });
		vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));
		vi.spyOn(console, "error").mockImplementation(() => {});

		const result = await updateFuchsenItem(item.id, { pictureUrl: NEW_PIC });

		expect(result.success).toBe(true);
		expect((await itemRow(item.id))?.picture).toBe(NEW_PIC);
	});

	test("rejects empty updates and unknown items", async () => {
		await asFuchsenwart();

		expect(await updateFuchsenItem("missing", {})).toMatchObject({
			success: false,
			error: "Keine Daten zum Aktualisieren angegeben",
		});
		expect(await updateFuchsenItem("missing", { price: 2 })).toMatchObject({
			success: false,
			error: "Artikel nicht gefunden",
		});
	});
});

describe("deleteFuchsenItem", () => {
	test("removes the item and its picture", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem({ picture: OLD_PIC });

		const result = await deleteFuchsenItem(item.id);

		expect(result.success).toBe(true);
		expect(del).toHaveBeenCalledExactlyOnceWith(OLD_PIC);
		expect(await itemRow(item.id)).toBeUndefined();
	});

	test("does not touch blob storage for items without a picture", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem();

		await deleteFuchsenItem(item.id);

		expect(del).not.toHaveBeenCalled();
		expect(await itemRow(item.id)).toBeUndefined();
	});

	// The picture is deleted before the row; the FK from fuchsen_order then
	// blocks the row delete and the item survives with a dead picture URL.
	test.fails("keeps the picture of an item that has orders (new)", async () => {
		await asFuchsenwart();
		const member = await createUser();
		const item = await createFuchsenItem({ picture: OLD_PIC });
		await createFuchsenOrder({ user: member, item });
		vi.spyOn(console, "error").mockImplementation(() => {});

		await deleteFuchsenItem(item.id);

		expect(await itemRow(item.id)).toBeDefined();
		expect(del).not.toHaveBeenCalled();
	});
});

describe("toggleFuchsenItemAvailability", () => {
	test("flips availability back and forth", async () => {
		await asFuchsenwart();
		const item = await createFuchsenItem({ isCurrentlyAvailable: true });

		await toggleFuchsenItemAvailability(item.id);
		expect((await itemRow(item.id))?.isCurrentlyAvailable).toBe(false);

		await toggleFuchsenItemAvailability(item.id);
		expect((await itemRow(item.id))?.isCurrentlyAvailable).toBe(true);
	});

	test("reports unknown items", async () => {
		await asFuchsenwart();

		expect(await toggleFuchsenItemAvailability("missing")).toMatchObject({
			success: false,
			error: "Artikel nicht gefunden",
		});
	});
});

describe("getFuchsenItemsForMenu", () => {
	test("orders items by total amount ordered, unordered items last", async () => {
		await createTenant();
		const member = await createUser();
		const mars = await createFuchsenItem({ name: "Mars" });
		const twix = await createFuchsenItem({ name: "Twix" });
		const snickers = await createFuchsenItem({ name: "Snickers" });
		await createFuchsenOrder({ user: member, item: mars, amount: 2 });
		await createFuchsenOrder({ user: member, item: twix, amount: 3 });
		await createFuchsenOrder({ user: member, item: mars, amount: 2 });
		signInAs(member);

		const menu = await getFuchsenItemsForMenu();

		expect(menu.map((i) => i.id)).toEqual([mars.id, twix.id, snickers.id]);
	});
});
