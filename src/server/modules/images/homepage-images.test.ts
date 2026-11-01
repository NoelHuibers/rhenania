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
	getAllHomepageImages,
	saveHomepageImage,
	toggleImageActive,
	updateImageOrder,
} from "./actions";

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
			ok: true,
			data: { displayOrder: 0, uploadedBy: fotowart.id, isActive: true },
		});
		expect(second.ok && second.data?.displayOrder).toBe(1);
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

		expect(await saveHomepageImage(image("header", 1))).toEqual({
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		});
		expect(await tenantDb().select().from(homepageImages)).toHaveLength(0);
	});
});

describe("reading images", () => {
	test("getAllHomepageImages groups everything by section for the admin view", async () => {
		await asFotowart();
		await createHomepageImage({ section: "header", isActive: false });
		await createHomepageImage({ section: "header" });
		await createHomepageImage({ section: "haus" });

		const result = await getAllHomepageImages();

		expect(result.ok).toBe(true);
		const grouped = result.ok ? result.data : {};
		expect(Object.keys(grouped).sort()).toEqual(["haus", "header"]);
		expect(grouped.header).toHaveLength(2);
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
			ok: true,
			data: {
				deactivatedIds: [current.id],
				image: { id: old.id, isActive: true },
			},
		});
		const rows = await rowsOf("header");
		expect(rows.filter((r) => r.isActive).map((r) => r.id)).toEqual([old.id]);
	});

	test("gallery images toggle independently", async () => {
		await asFotowart();
		const a = await createHomepageImage({ section: "haus" });
		const b = await createHomepageImage({ section: "haus", isActive: false });

		expect(await toggleImageActive(b.id)).toMatchObject({
			ok: true,
			data: { deactivatedIds: [] },
		});
		expect(await toggleImageActive(a.id)).toMatchObject({
			ok: true,
			data: { image: { id: a.id, isActive: false } },
		});
		const rows = await rowsOf("haus");
		expect(rows.find((r) => r.id === b.id)?.isActive).toBe(true);
		expect(rows.find((r) => r.id === a.id)?.isActive).toBe(false);
	});

	test("reports unknown images", async () => {
		await asFotowart();
		expect(await toggleImageActive("nope")).toEqual({
			ok: false,
			error: "Bild nicht gefunden",
			code: "NOT_FOUND",
		});
	});
});

describe("deleteHomepageImage", () => {
	test("deletes the row and its blob", async () => {
		await asFotowart();
		const img = await createHomepageImage({ section: "footer" });

		expect(await deleteHomepageImage(img.id)).toEqual({ ok: true });
		expect(await rowsOf("footer")).toHaveLength(0);
		expect(del).toHaveBeenCalledWith(img.imageUrl);
	});

	test("a failing blob delete does not undo the deletion", async () => {
		await asFotowart();
		const img = await createHomepageImage({ section: "footer" });
		vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));

		expect((await deleteHomepageImage(img.id)).ok).toBe(true);
		expect(await rowsOf("footer")).toHaveLength(0);
	});

	test("reports unknown images without touching blobs", async () => {
		await asFotowart();
		expect(await deleteHomepageImage("nope")).toEqual({
			ok: false,
			error: "Bild nicht gefunden",
			code: "NOT_FOUND",
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

		expect(await updateImageOrder([c.id, a.id, b.id])).toEqual({ ok: true });
		expect((await rowsOf("aktive")).map((r) => r.id)).toEqual([
			c.id,
			a.id,
			b.id,
		]);
	});

	test("requires a signed-in user", async () => {
		await createTenant();
		expect(await updateImageOrder([])).toEqual({
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		});
	});
});
