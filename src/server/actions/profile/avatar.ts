// ~/server/actions/profile/avatar-upload.ts
"use server";

import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";
import { users } from "~/server/db/schema";
import { isTenantBlobUrl } from "~/server/lib/blob-url";
import { defineAction } from "~/server/lib/define-action";
import { ValidationError } from "~/server/lib/domain-error";
import { log } from "~/server/lib/log";
import { requireCurrentTenant } from "~/server/lib/tenant-context";
import { checkAndUnlockAchievements } from "~/server/modules/achievements/tracking";

/**
 * Only blobs in the caller's own avatar folder may ever be deleted. Without
 * this, pointing your avatar at someone else's blob (a receipt, another
 * member's photo, another Corps' file) and then changing it again would
 * delete that file.
 */
function isOwnAvatarBlob(
	url: string | null | undefined,
	slug: string,
	userId: string,
): url is string {
	return isTenantBlobUrl(url, slug, `profile/${userId}/`);
}

/** Deletes an old avatar blob; the new avatar is saved even if this fails. */
async function deleteBlob(url: string): Promise<void> {
	try {
		await del(url);
	} catch (error) {
		await log.warn("old avatar blob not deleted", { err: error });
	}
}

function isHttpsUrl(url: string) {
	try {
		return new URL(url).protocol === "https:";
	} catch {
		return false;
	}
}

const AVATAR_PAGES = ["/profile", "/leaderboard", "/eloranking"];

/** Sets the caller's avatar (form field `imageUrl`, https only). */
export const updateUserAvatarUrl = defineAction(
	{
		schema: z.tuple([z.instanceof(FormData)]),
		errorMessage: "Update fehlgeschlagen",
		revalidate: AVATAR_PAGES,
	},
	async ([formData], { tenant, user }) => {
		const imageUrl = formData.get("imageUrl");
		if (typeof imageUrl !== "string" || !imageUrl) {
			throw new ValidationError("Keine Bild-URL angegeben");
		}
		if (!isHttpsUrl(imageUrl)) {
			throw new ValidationError("Nur https-Bild-URLs sind erlaubt");
		}
		const { slug } = await requireCurrentTenant();
		const { db } = tenant;

		const [currentUser] = await db
			.select({ image: users.image })
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);
		const oldImageUrl = currentUser?.image;

		// Delete the previous upload, but only if it is this user's own avatar.
		if (
			oldImageUrl !== imageUrl &&
			isOwnAvatarBlob(oldImageUrl, slug, user.id)
		) {
			await deleteBlob(oldImageUrl);
		}

		await db
			.update(users)
			.set({ image: imageUrl })
			.where(eq(users.id, user.id));

		after(() =>
			checkAndUnlockAchievements(tenant, user.id, "profile_picture_set"),
		);

		return { imageUrl };
	},
);

/** Removes the caller's avatar (and its blob, if it is their own upload). */
export const deleteUserAvatar = defineAction(
	{ errorMessage: "Löschen fehlgeschlagen", revalidate: AVATAR_PAGES },
	async ({ tenant, user }) => {
		const { db } = tenant;
		const [currentUser] = await db
			.select({ image: users.image })
			.from(users)
			.where(eq(users.id, user.id))
			.limit(1);
		const imageUrl = currentUser?.image;
		const { slug } = await requireCurrentTenant();

		if (isOwnAvatarBlob(imageUrl, slug, user.id)) {
			await deleteBlob(imageUrl);
		}

		await db.update(users).set({ image: null }).where(eq(users.id, user.id));
	},
);
