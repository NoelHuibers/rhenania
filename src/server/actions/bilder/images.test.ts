import { beforeEach, describe, expect, test, vi } from "vitest";

import { createHomepageImage } from "../../../../test/factories/platform";
import { createTenant, setupTestDatabases } from "../../../../test/harness";
import { requireTenant } from "../../../../test/state";
import { getActiveImageBySection, getAllActiveImagesBySection } from "./images";

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
});

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
