"use server";

// actions.ts — the website's pictures (#33). The public pages read them
// without a session; unlike the other read loaders (#216) these answer a
// failed read with no picture instead of throwing: the pictures are
// decoration, and the landing page should still render when they can't be
// read. The Fotowart's changes are defineActions answering with an
// ActionResult.

import { z } from "zod";
import { ROLES } from "~/server/lib/authz";
import { defineAction } from "~/server/lib/define-action";
import { log } from "~/server/lib/log";
import { currentTenantScope } from "~/server/lib/tenant-scope";
import * as images from "./service";

export type { HomepageSection } from "./service";

type Section = "header" | "aktive" | "haus" | "footer";

// ─── The public pages ────────────────────────────────────────────────────────

export async function getActiveImageBySection(section: Section) {
	try {
		return await images.activeImage(await currentTenantScope(), section);
	} catch (error) {
		await log.error("homepage image read failed", { section, err: error });
		return null;
	}
}

export async function getAllActiveImagesBySection(section: Section) {
	try {
		return await images.activeImages(await currentTenantScope(), section);
	} catch (error) {
		await log.error("homepage images read failed", { section, err: error });
		return [];
	}
}

// ─── The Fotowart ────────────────────────────────────────────────────────────

const IMAGE_PAGES = ["/", "/admin"];

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
	async ([data], { tenant, user }) => images.saveImage(tenant, user, data),
);

// Get all images (including inactive) for admin panel
export const getAllHomepageImages = defineAction(
	{ roles: ROLES.fotos, errorMessage: "Fehler beim Laden der Bilder" },
	async ({ tenant }) => images.imagesBySection(tenant),
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
	async ([imageId], { tenant }) => images.toggleActive(tenant, imageId),
);

// Delete image
export const deleteHomepageImage = defineAction(
	{
		roles: ROLES.fotos,
		schema: z.tuple([z.string()]),
		revalidate: IMAGE_PAGES,
		errorMessage: "Fehler beim Löschen des Bildes",
	},
	async ([imageId], { tenant }) => images.deleteImage(tenant, imageId),
);

// Update display order for multiple images at once
export const updateImageOrder = defineAction(
	{
		roles: ROLES.fotos,
		schema: z.tuple([z.array(z.string())]),
		revalidate: IMAGE_PAGES,
		errorMessage: "Fehler beim Aktualisieren der Reihenfolge",
	},
	async ([imageIds], { tenant }) => images.reorder(tenant, imageIds),
);
