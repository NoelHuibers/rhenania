// repo.ts — the website's pictures in the tenant DB (#33).
//
// Drizzle reads and writes of `homepage_image`. Every function takes the
// database it runs on; none checks the caller, applies a rule or
// revalidates a page. A read that may find nothing returns null or []; a
// failed query throws. The files live in Vercel Blob.

import "server-only";

import { and, desc, eq, inArray } from "drizzle-orm";
import { homepageImages } from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

export type HomepageImage = typeof homepageImages.$inferSelect;
export type HomepageImageInsert = typeof homepageImages.$inferInsert;

const activeIn = (section: string) =>
	and(eq(homepageImages.section, section), eq(homepageImages.isActive, true));

/** The section's active picture with the highest display order, or null. */
export async function topActiveImage(
	db: TenantDb,
	section: string,
): Promise<HomepageImage | null> {
	const images = await db
		.select()
		.from(homepageImages)
		.where(activeIn(section))
		.orderBy(desc(homepageImages.displayOrder))
		.limit(1);
	return images[0] || null;
}

/** The section's active pictures in display order. */
export async function activeImages(
	db: TenantDb,
	section: string,
): Promise<HomepageImage[]> {
	return db
		.select()
		.from(homepageImages)
		.where(activeIn(section))
		.orderBy(homepageImages.displayOrder);
}

/** Every picture by section and display order. */
export async function allImages(db: TenantDb): Promise<HomepageImage[]> {
	return db
		.select()
		.from(homepageImages)
		.orderBy(homepageImages.section, homepageImages.displayOrder);
}

export async function imageById(
	db: TenantDb,
	imageId: string,
): Promise<HomepageImage | null> {
	const [image] = await db
		.select()
		.from(homepageImages)
		.where(eq(homepageImages.id, imageId))
		.limit(1);
	return image ?? null;
}

/** The ids of the section's active pictures. */
export async function activeImageIds(
	db: TenantDb,
	section: string,
): Promise<string[]> {
	const rows = await db
		.select({ id: homepageImages.id })
		.from(homepageImages)
		.where(activeIn(section));
	return rows.map((img) => img.id);
}

/** The highest display order in the section, or null when it is empty. */
export async function maxDisplayOrder(
	db: TenantDb,
	section: string,
): Promise<number | null> {
	const maxOrder = await db
		.select({ maxOrder: homepageImages.displayOrder })
		.from(homepageImages)
		.where(eq(homepageImages.section, section))
		.orderBy(desc(homepageImages.displayOrder))
		.limit(1);
	return maxOrder[0]?.maxOrder ?? null;
}

export async function deactivateSection(db: TenantDb, section: string) {
	await db
		.update(homepageImages)
		.set({ isActive: false })
		.where(activeIn(section));
}

export async function deactivateImages(db: TenantDb, imageIds: string[]) {
	await db
		.update(homepageImages)
		.set({ isActive: false })
		.where(inArray(homepageImages.id, imageIds));
}

export async function insertImage(
	db: TenantDb,
	values: HomepageImageInsert,
): Promise<HomepageImage | undefined> {
	const [image] = await db.insert(homepageImages).values(values).returning();
	return image;
}

/** The changed picture, or undefined if there is no such picture. */
export async function setImageActive(
	db: TenantDb,
	imageId: string,
	isActive: boolean,
): Promise<HomepageImage | undefined> {
	const [updated] = await db
		.update(homepageImages)
		.set({ isActive })
		.where(eq(homepageImages.id, imageId))
		.returning();
	return updated;
}

export async function deleteImage(db: TenantDb, imageId: string) {
	await db.delete(homepageImages).where(eq(homepageImages.id, imageId));
}

/** Sets each picture's display order to its index, in one transaction. */
export async function reorderImages(db: TenantDb, imageIds: string[]) {
	await db.transaction(async (tx) => {
		const updates = imageIds.map((id, index) =>
			tx
				.update(homepageImages)
				.set({ displayOrder: index })
				.where(eq(homepageImages.id, id)),
		);
		await Promise.all(updates);
	});
}
