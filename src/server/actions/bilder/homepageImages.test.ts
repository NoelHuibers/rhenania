import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { homepageImages } from "~/server/db/schema";
import { createHomepageImage } from "../../../../test/factories/platform";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	deleteHomepageImage,
	getActiveHomepageImages,
	getAllHomepageImages,
	saveHomepageImage,
	toggleImageActive,
	updateImageOrder,
} from "./homepageImages";

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));

setupTestDatabases();

beforeEach(() => {
	vi.mocked(del).mockReset();
	vi.mocked(del).mockResolvedValue(undefined);
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function asFotowart() {
	await createTenant({ slug: "hassia" });
	const fotowart = await createUser({ roles: ["Fotowart"] });
	signInAs(fotowart);
	return fotowart;
}

const image = (section: string, n: number) => ({
	section,
	imageUrl: `https://x.public.blob.vercel-storage.com/tenants/hassia/homepage/${section}/${n}.jpg`,
	imageName: `${n}.jpg`,
	fileSize: 1000,
	mimeType: "image/jpeg",
});

const rowsOf = (section: string) =>
	tenantDb()
		.select()
		.from(homepageImages)
		.where(eq(homepageImages.section, section))
		.orderBy(homepageImages.displayOrder);

describe("saveHomepageImage", () => {
	test("a new header replaces the active one", async () => {
		const fotowart = await asFotowart();

		const first = await saveHomepageImage(image("header", 1));
		const second = await saveHomepageImage(image("header", 2));

		expect(first).toMatchObject({
			success: true,
			message: "Bild erfolgreich hochgeladen",
			data: { displayOrder: 0, uploadedBy: fotowart.id, isActive: true },
		});
		expect(second.data?.displayOrder).toBe(1);
		const rows = await rowsOf("header");
		expect(rows.map((r) => [r.imageName, r.isActive])).toEqual([
			["1.jpg", false],
			["2.jpg", true],
		]);
	});

	test("gallery sections keep several active images", async () => {
		await asFotowart();

		await saveHomepageImage(image("aktive", 1));
		await saveHomepageImage(image("aktive", 2));
		await saveHomepageImage(image("haus", 1));

		expect((await rowsOf("aktive")).every((r) => r.isActive)).toBe(true);
		expect((await rowsOf("aktive")).map((r) => r.displayOrder)).toEqual([0, 1]);
		expect((await rowsOf("haus"))[0]?.displayOrder).toBe(0);
	});

	test("requires a signed-in user", async () => {
		await createTenant();

		await expect(saveHomepageImage(image("header", 1))).rejects.toThrow(
			"Nicht angemeldet",
		);
		expect(await tenantDb().select().from(homepageImages)).toHaveLength(0);
	});
});

describe("reading images", () => {
	test("getActiveHomepageImages filters by section and active state", async () => {
		await asFotowart();
		await createHomepageImage({ section: "aktive", displayOrder: 2 });
		await createHomepageImage({ section: "aktive", displayOrder: 1 });
		await createHomepageImage({ section: "aktive", isActive: false });
		await createHomepageImage({ section: "footer" });

		const aktive = await getActiveHomepageImages("aktive");
		expect(aktive.success).toBe(true);
		expect(aktive.data.map((i) => i.displayOrder)).toEqual([1, 2]);
		expect((await getActiveHomepageImages()).data).toHaveLength(3);
	});

	test("getAllHomepageImages groups everything by section for the admin view", async () => {
		await asFotowart();
		await createHomepageImage({ section: "header", isActive: false });
		await createHomepageImage({ section: "header" });
		await createHomepageImage({ section: "haus" });

		const result = await getAllHomepageImages();

		expect(result.success).toBe(true);
		expect(Object.keys(result.data).sort()).toEqual(["haus", "header"]);
		expect((result.data as Record<string, unknown[]>).header).toHaveLength(2);
	});
});

describe("toggleImageActive", () => {
	test("activating a header deactivates the current one", async () => {
		await asFotowart();
		const current = await createHomepageImage({ section: "header" });
		const old = await createHomepageImage({
			section: "header",
			isActive: false,
		});

		const result = await toggleImageActive(old.id);

		expect(result).toMatchObject({
			success: true,
			deactivatedIds: [current.id],
			message: "Bild aktiviert",
			data: { id: old.id, isActive: true },
		});
		const rows = await rowsOf("header");
		expect(rows.filter((r) => r.isActive).map((r) => r.id)).toEqual([old.id]);
	});

	test("gallery images toggle independently", async () => {
		await asFotowart();
		const a = await createHomepageImage({ section: "haus" });
		const b = await createHomepageImage({ section: "haus", isActive: false });

		expect(await toggleImageActive(b.id)).toMatchObject({
			success: true,
			deactivatedIds: [],
		});
		expect(await toggleImageActive(a.id)).toMatchObject({
			message: "Bild deaktiviert",
		});
		const rows = await rowsOf("haus");
		expect(rows.find((r) => r.id === b.id)?.isActive).toBe(true);
		expect(rows.find((r) => r.id === a.id)?.isActive).toBe(false);
	});

	test("reports unknown images", async () => {
		await asFotowart();
		expect(await toggleImageActive("nope")).toEqual({
			success: false,
			error: "Bild nicht gefunden",
		});
	});
});

describe("deleteHomepageImage", () => {
	test("deletes the row and its blob", async () => {
		await asFotowart();
		const img = await createHomepageImage({ section: "footer" });

		expect(await deleteHomepageImage(img.id)).toEqual({
			success: true,
			message: "Bild erfolgreich gelöscht",
		});
		expect(await rowsOf("footer")).toHaveLength(0);
		expect(del).toHaveBeenCalledWith(img.imageUrl);
	});

	test("a failing blob delete does not undo the deletion", async () => {
		await asFotowart();
		const img = await createHomepageImage({ section: "footer" });
		vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));

		expect((await deleteHomepageImage(img.id)).success).toBe(true);
		expect(await rowsOf("footer")).toHaveLength(0);
	});

	test("reports unknown images without touching blobs", async () => {
		await asFotowart();
		expect(await deleteHomepageImage("nope")).toEqual({
			success: false,
			error: "Bild nicht gefunden",
		});
		expect(del).not.toHaveBeenCalled();
	});
});

describe("updateImageOrder", () => {
	test("stores the new order as positions 0..n", async () => {
		await asFotowart();
		const a = await createHomepageImage({ section: "aktive", displayOrder: 0 });
		const b = await createHomepageImage({ section: "aktive", displayOrder: 1 });
		const c = await createHomepageImage({ section: "aktive", displayOrder: 2 });

		expect(await updateImageOrder([c.id, a.id, b.id])).toEqual({
			success: true,
			message: "Reihenfolge erfolgreich aktualisiert",
		});
		expect((await rowsOf("aktive")).map((r) => r.id)).toEqual([
			c.id,
			a.id,
			b.id,
		]);
	});

	test("requires a signed-in user", async () => {
		await createTenant();
		await expect(updateImageOrder([])).rejects.toThrow("Nicht angemeldet");
	});
});
