// server/actions/bilder/homepageImages.ts
"use server";

import { del } from "@vercel/blob";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { homepageImages } from "~/server/db/schema";
import { ROLES } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { NotFoundError } from "~/server/lib/domain-error";

// Per-tenant configurable; valid values come from the tenant's
// `homepage_section` table. Kept as `string` for type-level openness.
export type HomepageSection = string;

/** Sections with several active images; the others show one at a time. */
function allowsMultiple(section: string) {
	return section === "aktive" || section === "haus";
}

const IMAGE_PAGES = ["/", "/admin"];
const IMAGE_NOT_FOUND = "Bild nicht gefunden";

// Save a new homepage image
export const saveHomepageImage = defineAction(
	{
		roles: ROLES.fotos,
		schema: z.tuple([
			z.object({
				section: z.string(),
				imageUrl: z.string(),
				imageName: z.string(),
				fileSize: z.number().optional(),
				mimeType: z.string().optional(),
			}),
		]),
		revalidate: IMAGE_PAGES,
		errorMessage: "Fehler beim Speichern des Bildes",
	},
	async ([data], { tenant, user }) => {
		const { db } = tenant;
		if (!allowsMultiple(data.section)) {
			// Deactivate existing images for single-image sections
			await db
				.update(homepageImages)
				.set({ isActive: false })
				.where(
					and(
						eq(homepageImages.section, data.section),
						eq(homepageImages.isActive, true),
					),
				);
		}

		// Get the next display order
		const maxOrder = await db
			.select({ maxOrder: homepageImages.displayOrder })
			.from(homepageImages)
			.where(eq(homepageImages.section, data.section))
			.orderBy(desc(homepageImages.displayOrder))
			.limit(1);

		const nextOrder = (maxOrder[0]?.maxOrder ?? -1) + 1;

		const [newImage] = await db
			.insert(homepageImages)
			.values({
				section: data.section,
				imageUrl: data.imageUrl,
				imageName: data.imageName,
				fileSize: data.fileSize,
				mimeType: data.mimeType,
				displayOrder: nextOrder,
				isActive: true,
				uploadedBy: user.id,
			})
			.returning();
		return newImage;
	},
);

// Get all images (including inactive) for admin panel
export const getAllHomepageImages = defineAction(
	{ roles: ROLES.fotos, errorMessage: "Fehler beim Laden der Bilder" },
	async ({ tenant }) => {
		const images = await tenant.db
			.select()
			.from(homepageImages)
			.orderBy(homepageImages.section, homepageImages.displayOrder);

		return images.reduce(
			(acc, img) => {
				const list = acc[img.section] ?? [];
				list.push(img);
				acc[img.section] = list;
				return acc;
			},
			{} as Record<HomepageSection, typeof images>,
		);
	},
);

/**
 * Toggles an image; activating one in a single-image section deactivates
 * the others, whose ids come back in `deactivatedIds`.
 */
export const toggleImageActive = defineAction(
	{
		roles: ROLES.fotos,
		schema: z.tuple([z.string()]),
		revalidate: IMAGE_PAGES,
		errorMessage: "Fehler beim Ändern des Status",
	},
	async ([imageId], { tenant }) => {
		const { db } = tenant;
		const [image] = await db
			.select()
			.from(homepageImages)
			.where(eq(homepageImages.id, imageId))
			.limit(1);

		if (!image) {
			throw new NotFoundError(IMAGE_NOT_FOUND);
		}

		let deactivatedIds: string[] = [];

		if (!allowsMultiple(image.section) && !image.isActive) {
			const toDeactivate = await db
				.select({ id: homepageImages.id })
				.from(homepageImages)
				.where(
					and(
						eq(homepageImages.section, image.section),
						eq(homepageImages.isActive, true),
					),
				);

			deactivatedIds = toDeactivate.map((img) => img.id);

			// Deactivate other images in the section first
			if (deactivatedIds.length > 0) {
				await db
					.update(homepageImages)
					.set({ isActive: false })
					.where(inArray(homepageImages.id, deactivatedIds));
			}
		}

		const [updated] = await db
			.update(homepageImages)
			.set({ isActive: !image.isActive })
			.where(eq(homepageImages.id, imageId))
			.returning();

		if (!updated) {
			throw new NotFoundError(IMAGE_NOT_FOUND);
		}
		return { image: updated, deactivatedIds };
	},
);

// Delete image
export const deleteHomepageImage = defineAction(
	{
		roles: ROLES.fotos,
		schema: z.tuple([z.string()]),
		revalidate: IMAGE_PAGES,
		errorMessage: "Fehler beim Löschen des Bildes",
	},
	async ([imageId], { tenant }) => {
		const [image] = await tenant.db
			.select()
			.from(homepageImages)
			.where(eq(homepageImages.id, imageId))
			.limit(1);

		if (!image) {
			throw new NotFoundError(IMAGE_NOT_FOUND);
		}

		// Delete from database first
		await tenant.db
			.delete(homepageImages)
			.where(eq(homepageImages.id, imageId));

		// Try to delete from blob storage (non-blocking)
		del(image.imageUrl).catch((error) => {
			console.error("Error deleting from blob storage:", error);
		});
	},
);

// Update display order for multiple images at once
export const updateImageOrder = defineAction(
	{
		roles: ROLES.fotos,
		schema: z.tuple([z.array(z.string())]),
		revalidate: IMAGE_PAGES,
		errorMessage: "Fehler beim Aktualisieren der Reihenfolge",
	},
	async ([imageIds], { tenant }) => {
		// Use a transaction to ensure all updates happen together
		await tenant.db.transaction(async (tx) => {
			const updates = imageIds.map((id, index) =>
				tx
					.update(homepageImages)
					.set({ displayOrder: index })
					.where(eq(homepageImages.id, id)),
			);

			await Promise.all(updates);
		});
	},
);
