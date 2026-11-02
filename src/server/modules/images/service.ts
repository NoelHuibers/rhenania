// service.ts — the website's pictures (#33): the public pages' reads and
// the Fotowart's changes.
//
// Every function takes the TenantScope it works in; failures the user
// should read are DomainErrors, anything else (a failed query) propagates.
// The sections "aktive" and "haus" show several active pictures, the
// others one at a time.

import "server-only";

import { del } from "@vercel/blob";
import { NotFoundError } from "~/server/lib/domain-error";
import type { TenantScope } from "~/server/lib/tenant-scope";
import * as repo from "./repo";

// Per-tenant configurable; valid values come from the tenant's
// `homepage_section` table. Kept as `string` for type-level openness.
export type HomepageSection = string;

/** Sections with several active images; the others show one at a time. */
function allowsMultiple(section: string) {
	return section === "aktive" || section === "haus";
}

const IMAGE_NOT_FOUND = "Bild nicht gefunden";

// ─── The public pages ────────────────────────────────────────────────────────

/** The section's current picture, or null. */
export function activeImage({ db }: TenantScope, section: HomepageSection) {
	return repo.topActiveImage(db, section);
}

/** The section's active pictures in display order. */
export function activeImages({ db }: TenantScope, section: HomepageSection) {
	return repo.activeImages(db, section);
}

// ─── The Fotowart ────────────────────────────────────────────────────────────

type NewImage = {
	section: string;
	imageUrl: string;
	imageName: string;
	fileSize?: number;
	mimeType?: string;
};

/** Adds an uploaded picture at the end of its section, active. */
export async function saveImage(
	{ db }: TenantScope,
	user: { id: string },
	data: NewImage,
) {
	if (!allowsMultiple(data.section)) {
		// Deactivate existing images for single-image sections
		await repo.deactivateSection(db, data.section);
	}

	// Get the next display order
	const nextOrder = ((await repo.maxDisplayOrder(db, data.section)) ?? -1) + 1;

	return repo.insertImage(db, {
		section: data.section,
		imageUrl: data.imageUrl,
		imageName: data.imageName,
		fileSize: data.fileSize,
		mimeType: data.mimeType,
		displayOrder: nextOrder,
		isActive: true,
		uploadedBy: user.id,
	});
}

/** Every picture (also inactive ones) per section. */
export async function imagesBySection({ db }: TenantScope) {
	const images = await repo.allImages(db);
	return images.reduce(
		(acc, img) => {
			const list = acc[img.section] ?? [];
			list.push(img);
			acc[img.section] = list;
			return acc;
		},
		{} as Record<HomepageSection, typeof images>,
	);
}

/**
 * Toggles an image; activating one in a single-image section deactivates
 * the others, whose ids come back in `deactivatedIds`.
 */
export async function toggleActive({ db }: TenantScope, imageId: string) {
	const image = await repo.imageById(db, imageId);
	if (!image) {
		throw new NotFoundError(IMAGE_NOT_FOUND);
	}

	let deactivatedIds: string[] = [];
	if (!allowsMultiple(image.section) && !image.isActive) {
		deactivatedIds = await repo.activeImageIds(db, image.section);
		// Deactivate other images in the section first
		if (deactivatedIds.length > 0) {
			await repo.deactivateImages(db, deactivatedIds);
		}
	}

	const updated = await repo.setImageActive(db, imageId, !image.isActive);
	if (!updated) {
		throw new NotFoundError(IMAGE_NOT_FOUND);
	}
	return { image: updated, deactivatedIds };
}

/** Deletes the picture, then (without waiting) its file. */
export async function deleteImage({ db }: TenantScope, imageId: string) {
	const image = await repo.imageById(db, imageId);
	if (!image) {
		throw new NotFoundError(IMAGE_NOT_FOUND);
	}

	// Delete from database first
	await repo.deleteImage(db, imageId);

	// Try to delete from blob storage (non-blocking)
	del(image.imageUrl).catch((error) => {
		console.error("Error deleting from blob storage:", error);
	});
}

/** The pictures' display order: their order in `imageIds`. */
export async function reorder({ db }: TenantScope, imageIds: string[]) {
	await repo.reorderImages(db, imageIds);
}
