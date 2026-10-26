import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { drinks } from "~/server/db/schema";
import {
	createInventory,
	createOrderRow,
} from "../../../test/factories/inventory";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../test/harness";
import {
	addDrink,
	deleteDrink,
	deleteDrinkImage,
	getDrinks,
	toggleDrinkAvailability,
	updateDrink,
} from "./drinks";

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

setupTestDatabases();

const OLD_PICTURE = "https://blob.example.test/drinks/old.webp";
const NEW_PICTURE = "https://blob.example.test/drinks/new.webp";
const IN_USE =
	"Das Getränk wurde schon bestellt oder gezählt und kann deshalb nicht gelöscht werden. Setze es stattdessen auf „Nicht verfügbar“.";

beforeEach(async () => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	await createTenant();
	signInAs(await createUser({ roles: ["Getränkewart"] }));
});

async function drinkRow(id: string) {
	const [row] = await tenantDb().select().from(drinks).where(eq(drinks.id, id));
	return row;
}

async function createDrinkWithPicture(picture = OLD_PICTURE) {
	const drink = await createDrink({ name: "Pils" });
	await tenantDb()
		.update(drinks)
		.set({ picture })
		.where(eq(drinks.id, drink.id));
	return drink;
}

describe("addDrink", () => {
	test("stores a validated drink and maps optional fields", async () => {
		const result = await addDrink({
			name: "Kölsch",
			price: 1.2,
			volume: 0.33,
			kastengroesse: 24,
			pictureUrl: NEW_PICTURE,
			isCurrentlyAvailable: false,
		});

		expect(result).toMatchObject({
			success: true,
			message: "Getränk erfolgreich hinzugefügt",
		});
		expect(await tenantDb().select().from(drinks)).toEqual([
			expect.objectContaining({
				id: result.data?.id,
				name: "Kölsch",
				price: 1.2,
				volume: 0.33,
				kastengroesse: 24,
				picture: NEW_PICTURE,
				isCurrentlyAvailable: false,
			}),
		]);
	});

	test("leaves omitted optional fields empty", async () => {
		const result = await addDrink({
			name: "Wasser",
			price: 0.5,
			isCurrentlyAvailable: true,
		});

		expect(result.data).toMatchObject({
			volume: null,
			kastengroesse: null,
			picture: null,
			isCurrentlyAvailable: true,
		});
	});

	test.each([
		["an empty name", { name: "", price: 1 }, "Name ist erforderlich"],
		["a zero price", { name: "Pils", price: 0 }, "Preis muss positiv sein"],
		["a price over 999.99", { name: "Pils", price: 1000 }, "Preis ist zu hoch"],
		[
			"a fractional crate size",
			{ name: "Pils", price: 1, kastengroesse: 20.5 },
			"Kastengröße muss eine ganze Zahl sein",
		],
		[
			"an invalid picture URL",
			{ name: "Pils", price: 1, pictureUrl: "not a url" },
			undefined,
		],
	])("rejects %s and writes nothing", async (_label, input, message) => {
		const result = await addDrink({ isCurrentlyAvailable: true, ...input });

		expect(result).toMatchObject({
			success: false,
			error: "Validierungsfehler",
		});
		if (message) {
			expect(result.details?.map((d) => d.message)).toContain(message);
		}
		expect(await tenantDb().select().from(drinks)).toHaveLength(0);
	});
});

describe("updateDrink", () => {
	test("updates the given fields and stamps updatedAt", async () => {
		const drink = await createDrink({ name: "Pils", price: 1.2 });

		const result = await updateDrink(drink.id, { price: 1.4, volume: 0.5 });

		expect(result).toMatchObject({ success: true });
		const row = await drinkRow(drink.id);
		expect(row).toMatchObject({ name: "Pils", price: 1.4, volume: 0.5 });
		expect(row?.updatedAt).toBeInstanceOf(Date);
	});

	test("rejects empty and invalid updates", async () => {
		const drink = await createDrink({ price: 1.2 });

		expect(await updateDrink(drink.id, {})).toEqual({
			success: false,
			error: "Keine Daten zum Aktualisieren angegeben",
		});
		expect(await updateDrink(drink.id, { price: -1 })).toMatchObject({
			success: false,
			error: "Validierungsfehler",
		});
		expect((await drinkRow(drink.id))?.price).toBe(1.2);
	});

	test("reports unknown drinks", async () => {
		expect(await updateDrink("deleted-drink", { price: 2 })).toEqual({
			success: false,
			error: "Getränk nicht gefunden",
		});
	});

	test("replacing the picture deletes the old blob", async () => {
		const drink = await createDrinkWithPicture();

		await updateDrink(drink.id, { pictureUrl: NEW_PICTURE });

		expect(del).toHaveBeenCalledExactlyOnceWith(OLD_PICTURE);
		expect((await drinkRow(drink.id))?.picture).toBe(NEW_PICTURE);
	});

	test("re-saving the same picture keeps the blob", async () => {
		const drink = await createDrinkWithPicture();

		await updateDrink(drink.id, { pictureUrl: OLD_PICTURE, price: 2 });

		expect(del).not.toHaveBeenCalled();
		expect(await drinkRow(drink.id)).toMatchObject({
			picture: OLD_PICTURE,
			price: 2,
		});
	});

	test("a failing blob delete does not block the update", async () => {
		const drink = await createDrinkWithPicture();
		vi.mocked(del).mockRejectedValueOnce(new Error("blob store down"));

		const result = await updateDrink(drink.id, { pictureUrl: NEW_PICTURE });

		expect(result.success).toBe(true);
		expect((await drinkRow(drink.id))?.picture).toBe(NEW_PICTURE);
	});
});

describe("deleteDrinkImage", () => {
	test("deletes the blob and clears the picture", async () => {
		const drink = await createDrinkWithPicture();

		expect(await deleteDrinkImage(drink.id)).toEqual({
			success: true,
			message: "Bild erfolgreich gelöscht",
		});
		expect(del).toHaveBeenCalledExactlyOnceWith(OLD_PICTURE);
		expect((await drinkRow(drink.id))?.picture).toBeNull();
	});

	test("keeps the picture reference when the blob delete fails", async () => {
		const drink = await createDrinkWithPicture();
		vi.mocked(del).mockRejectedValueOnce(new Error("blob store down"));

		expect(await deleteDrinkImage(drink.id)).toEqual({
			success: false,
			error: "Fehler beim Löschen des Bildes",
		});
		expect((await drinkRow(drink.id))?.picture).toBe(OLD_PICTURE);
	});

	test("is a no-op for drinks without a picture and fails for unknown drinks", async () => {
		const drink = await createDrink();

		expect((await deleteDrinkImage(drink.id)).success).toBe(true);
		expect(del).not.toHaveBeenCalled();
		expect(await deleteDrinkImage("deleted-drink")).toEqual({
			success: false,
			error: "Getränk nicht gefunden",
		});
	});
});

describe("deleteDrink", () => {
	test("removes the drink and its picture", async () => {
		const drink = await createDrinkWithPicture();
		const other = await createDrink();

		expect((await deleteDrink(drink.id)).success).toBe(true);

		expect(del).toHaveBeenCalledExactlyOnceWith(OLD_PICTURE);
		expect((await tenantDb().select().from(drinks)).map((d) => d.id)).toEqual([
			other.id,
		]);
	});

	test("still removes the drink when the blob delete fails", async () => {
		const drink = await createDrinkWithPicture();
		vi.mocked(del).mockRejectedValueOnce(new Error("blob store down"));

		expect((await deleteDrink(drink.id)).success).toBe(true);
		expect(await drinkRow(drink.id)).toBeUndefined();
	});

	test("refuses to delete a drink that has orders and suggests deactivating it", async () => {
		const drink = await createDrink();
		await createOrderRow({ drink });

		expect(await deleteDrink(drink.id)).toEqual({
			success: false,
			error: IN_USE,
		});
		expect(await drinkRow(drink.id)).toBeDefined();
	});

	test("refuses to delete a drink that was counted in an inventory", async () => {
		const drink = await createDrink();
		await createInventory({ items: [{ drink, countedStock: 3 }] });

		expect(await deleteDrink(drink.id)).toEqual({
			success: false,
			error: IN_USE,
		});
		expect(await drinkRow(drink.id)).toBeDefined();
	});

	test("keeps the picture of a drink it could not delete (#137)", async () => {
		const drink = await createDrinkWithPicture();
		await createOrderRow({ drink });

		await deleteDrink(drink.id);

		expect((await drinkRow(drink.id))?.picture).toBe(OLD_PICTURE);
		expect(del).not.toHaveBeenCalled();
	});

	test("reports other database errors generically and keeps the picture", async () => {
		const drink = await createDrinkWithPicture();
		vi.spyOn(tenantDb(), "delete").mockImplementationOnce(() => {
			throw new Error("database is locked");
		});

		expect(await deleteDrink(drink.id)).toEqual({
			success: false,
			error: "Fehler beim Löschen des Getränks",
		});
		expect(del).not.toHaveBeenCalled();
		expect((await drinkRow(drink.id))?.picture).toBe(OLD_PICTURE);
	});

	test("succeeds without touching blob storage for an unknown drink", async () => {
		expect((await deleteDrink("deleted-drink")).success).toBe(true);
		expect(del).not.toHaveBeenCalled();
	});
});

describe("toggleDrinkAvailability", () => {
	test("flips availability back and forth", async () => {
		const drink = await createDrink({ available: true });

		const first = await toggleDrinkAvailability(drink.id);
		expect(first.data?.isCurrentlyAvailable).toBe(false);
		expect((await drinkRow(drink.id))?.isCurrentlyAvailable).toBe(false);

		await toggleDrinkAvailability(drink.id);
		expect((await drinkRow(drink.id))?.isCurrentlyAvailable).toBe(true);
	});

	test("reports unknown drinks", async () => {
		expect(await toggleDrinkAvailability("deleted-drink")).toEqual({
			success: false,
			error: "Getränk nicht gefunden",
		});
	});
});

describe("getDrinks", () => {
	test("returns all drinks, newest first, including unavailable ones", async () => {
		const day = 86_400_000;
		for (const [name, age, available] of [
			["Alt", 3, false],
			["Neu", 1, true],
			["Mittel", 2, true],
		] as const) {
			await tenantDb()
				.insert(drinks)
				.values({
					name,
					price: 1,
					isCurrentlyAvailable: available,
					createdAt: new Date(
						Math.floor((Date.now() - age * day) / 1000) * 1000,
					),
				});
		}

		expect((await getDrinks()).map((d) => d.name)).toEqual([
			"Neu",
			"Mittel",
			"Alt",
		]);
	});
});
