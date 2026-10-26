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
import { requireTenant } from "../../../../test/state";
import {
	deleteHomepageImage,
	getActiveImageBySection,
	getAllActiveImagesBySection,
	toggleImageActive,
	updateImageOrder,
	uploadHomepageImage,
} from "./images";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

async function asFotowart() {
	await createTenant();
	const fotowart = await createUser({ roles: ["Fotowart"] });
	signInAs(fotowart);
	return fotowart;
}

describe("public homepage images", () => {
	test("getActiveImageBySection returns the active image with the highest order", async () => {
		await createTenant();
		await createHomepageImage({ section: "header", displayOrder: 1 });
		const top = await createHomepageImage({
			section: "header",
			displayOrder: 5,
		});
		await createHomepageImage({
			section: "header",
			displayOrder: 9,
			isActive: false,
		});

		expect((await getActiveImageBySection("header"))?.id).toBe(top.id);
		expect(await getActiveImageBySection("footer")).toBeNull();
	});

	test("getAllActiveImagesBySection lists active images in display order", async () => {
		await createTenant();
		const b = await createHomepageImage({ section: "aktive", displayOrder: 2 });
		const a = await createHomepageImage({ section: "aktive", displayOrder: 1 });
		await createHomepageImage({ section: "aktive", isActive: false });

		expect(
			(await getAllActiveImagesBySection("aktive")).map((i) => i.id),
		).toEqual([a.id, b.id]);
	});

	test("read errors degrade to empty results", async () => {
		await createTenant();
		await requireTenant().client.execute("DROP TABLE homepage_image");

		expect(await getActiveImageBySection("header")).toBeNull();
		expect(await getAllActiveImagesBySection("haus")).toEqual([]);
	});
});

describe("managing images (Fotowart)", () => {
	test("upload, reorder, toggle and delete", async () => {
		const fotowart = await asFotowart();

		expect(
			await uploadHomepageImage({
				section: "haus",
				imageUrl: "https://blob.example/haus.jpg",
				imageName: "haus.jpg",
				displayOrder: 3,
				uploadedBy: fotowart.id,
			}),
		).toMatchObject({ success: true });
		const [row] = await tenantDb().select().from(homepageImages);
		expect(row).toMatchObject({
			section: "haus",
			displayOrder: 3,
			isActive: true,
			uploadedBy: fotowart.id,
		});
		const id = row?.id ?? "";
		const current = async () =>
			(
				await tenantDb()
					.select()
					.from(homepageImages)
					.where(eq(homepageImages.id, id))
			)[0];

		expect(await updateImageOrder(id, 7)).toEqual({ success: true });
		expect((await current())?.displayOrder).toBe(7);

		expect(await toggleImageActive(id)).toEqual({ success: true });
		expect((await current())?.isActive).toBe(false);

		expect(await deleteHomepageImage(id)).toEqual({ success: true });
		expect(await current()).toBeUndefined();
	});

	test("reports unknown images and failed uploads", async () => {
		await asFotowart();

		expect(await toggleImageActive("nope")).toEqual({
			success: false,
			error: "Image not found",
		});
		expect(
			await uploadHomepageImage({
				section: "haus",
				imageUrl: "https://blob.example/x.jpg",
				imageName: "x.jpg",
				uploadedBy: "not-a-user",
			}),
		).toEqual({ success: false, error: "Failed to upload image" });
	});
});
