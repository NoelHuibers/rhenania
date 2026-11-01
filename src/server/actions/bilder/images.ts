// bilder/images.ts — the public pages' pictures.
//
// Unlike the other read loaders (#216) these answer a failed read with no
// picture instead of throwing: the pictures are decoration, and the
// landing page should still render when they can't be read.
"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { homepageImages } from "~/server/db/schema";
import { log } from "~/server/lib/log";

export async function getActiveImageBySection(
	section: "header" | "aktive" | "haus" | "footer",
) {
	try {
		const images = await db
			.select()
			.from(homepageImages)
			.where(
				and(
					eq(homepageImages.section, section),
					eq(homepageImages.isActive, true),
				),
			)
			.orderBy(desc(homepageImages.displayOrder))
			.limit(1);

		return images[0] || null;
	} catch (error) {
		await log.error("homepage image read failed", { section, err: error });
		return null;
	}
}

export async function getAllActiveImagesBySection(
	section: "header" | "aktive" | "haus" | "footer",
) {
	try {
		const images = await db
			.select()
			.from(homepageImages)
			.where(
				and(
					eq(homepageImages.section, section),
					eq(homepageImages.isActive, true),
				),
			)
			.orderBy(homepageImages.displayOrder);

		return images;
	} catch (error) {
		await log.error("homepage images read failed", { section, err: error });
		return [];
	}
}
