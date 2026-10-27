// app/actions/homepage-images.ts
"use server";

import { and, desc, eq } from "drizzle-orm";
import { db } from "~/server/db";
import { homepageImages } from "~/server/db/schema";

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
		console.error(`Error fetching ${section} image:`, error);
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
		console.error(`Error fetching ${section} images:`, error);
		return [];
	}
}
