import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { checkAndUnlockAchievements } from "~/server/actions/achievements/tracking";
import { users } from "~/server/db/schema";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { testState } from "../../../../test/state";
import {
	deleteUserAvatar,
	updateUserAvatarUrl,
	updateUserAvatarWithUpload,
} from "./avatar";

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));
vi.mock("~/server/actions/achievements/tracking", () => ({
	checkAndUnlockAchievements: vi.fn(),
}));

setupTestDatabases();

beforeEach(() => {
	vi.mocked(del).mockReset();
	vi.spyOn(console, "error").mockImplementation(() => {});
});

const BLOB = "https://abc.public.blob.vercel-storage.com/tenants/t/profile";
/** The caller's own avatar folder; only blobs in here may be deleted. */
const own = (userId: string) => `${BLOB}/${userId}`;

async function memberWithImage(
	image: string | null | ((userId: string) => string),
) {
	await createTenant({ slug: "t" });
	const member = await createUser();
	const value = typeof image === "function" ? image(member.id) : image;
	await tenantDb()
		.update(users)
		.set({ image: value })
		.where(eq(users.id, member.id));
	signInAs(member);
	return member;
}

const imageOf = async (id: string) =>
	(await tenantDb().select().from(users).where(eq(users.id, id)))[0]?.image;

function fileForm(file?: File) {
	const data = new FormData();
	if (file) {
		data.set("file", file);
	}
	return data;
}

describe("updateUserAvatarWithUpload (pre-check)", () => {
	test("accepts JPEG, PNG and WebP up to 5 MB for client upload", async () => {
		await memberWithImage(null);

		for (const type of ["image/jpeg", "image/png", "image/webp"]) {
			const file = new File([new Uint8Array(1024)], "me", { type });
			expect(await updateUserAvatarWithUpload(fileForm(file))).toEqual({
				success: true,
				requiresClientUpload: true,
				message: "Datei bereit zum Upload",
			});
		}
	});

	test("rejects missing files, other types and files over 5 MB", async () => {
		await memberWithImage(null);

		expect(await updateUserAvatarWithUpload(fileForm())).toEqual({
			success: false,
			message: "Keine Datei hochgeladen",
		});
		const gif = new File(["x"], "a.gif", { type: "image/gif" });
		expect((await updateUserAvatarWithUpload(fileForm(gif))).message).toBe(
			"Ungültiger Dateityp. Erlaubt sind: JPEG, PNG, WebP",
		);
		const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], "big.png", {
			type: "image/png",
		});
		expect((await updateUserAvatarWithUpload(fileForm(big))).message).toBe(
			"Datei ist zu groß. Maximum: 5MB",
		);
	});
});

describe("updateUserAvatarUrl", () => {
	test("stores the uploaded avatar and replaces the previous blob", async () => {
		const member = await memberWithImage((id) => `${own(id)}/old.png`);
		const data = new FormData();
		data.set("imageUrl", `${own(member.id)}/new.png`);

		const result = await updateUserAvatarUrl(data);

		expect(result).toEqual({
			success: true,
			message: "Profilbild erfolgreich aktualisiert",
			imageUrl: `${own(member.id)}/new.png`,
		});
		expect(del).toHaveBeenCalledWith(`${own(member.id)}/old.png`);
		expect(await imageOf(member.id)).toBe(`${own(member.id)}/new.png`);
		expect(checkAndUnlockAchievements).toHaveBeenCalledWith(
			member.id,
			"profile_picture_set",
			undefined,
			{ tenantId: testState.tenantId },
		);
		expect(revalidatePath).toHaveBeenCalledWith("/profile");
	});

	test("never deletes a blob outside the caller's own avatar folder", async () => {
		// e.g. another member's photo or a receipt, set as avatar on purpose
		await memberWithImage(`${BLOB}/someone-else/photo.png`);
		const data = new FormData();
		data.set("imageUrl", "https://img.example/me.png");

		expect((await updateUserAvatarUrl(data)).success).toBe(true);
		expect(del).not.toHaveBeenCalled();

		await deleteUserAvatar();
		expect(del).not.toHaveBeenCalled();
	});

	test("only https image URLs are accepted", async () => {
		await memberWithImage(null);
		for (const url of [
			"javascript:alert(1)",
			"http://img.example/a.png",
			"data:image/png;base64,AA",
		]) {
			const data = new FormData();
			data.set("imageUrl", url);
			expect((await updateUserAvatarUrl(data)).success).toBe(false);
		}
	});

	test("does not try to delete external (e.g. Microsoft) images", async () => {
		const member = await memberWithImage("data:image/png;base64,AQID");
		const data = new FormData();
		data.set("imageUrl", `${BLOB}/new.png`);

		await updateUserAvatarUrl(data);

		expect(del).not.toHaveBeenCalled();
		expect(await imageOf(member.id)).toBe(`${BLOB}/new.png`);
	});

	test("still saves the new avatar when deleting the old blob fails", async () => {
		const member = await memberWithImage(`${BLOB}/old.png`);
		vi.mocked(del).mockRejectedValueOnce(new Error("blob down"));
		const data = new FormData();
		data.set("imageUrl", `${BLOB}/new.png`);

		expect((await updateUserAvatarUrl(data)).success).toBe(true);
		expect(await imageOf(member.id)).toBe(`${BLOB}/new.png`);
	});

	test("requires a signed-in member and an image URL", async () => {
		await createTenant();
		expect(await updateUserAvatarUrl(new FormData())).toEqual({
			success: false,
			message: "Nicht authentifiziert",
		});

		signInAs(await createUser());
		expect(await updateUserAvatarUrl(new FormData())).toEqual({
			success: false,
			message: "Keine Bild-URL angegeben",
		});
	});
});

describe("deleteUserAvatar", () => {
	test("removes the blob and clears the image", async () => {
		const member = await memberWithImage((id) => `${own(id)}/old.png`);

		expect(await deleteUserAvatar()).toEqual({
			success: true,
			message: "Profilbild erfolgreich gelöscht",
		});
		expect(del).toHaveBeenCalledWith(`${own(member.id)}/old.png`);
		expect(await imageOf(member.id)).toBeNull();
	});

	test("clears non-blob images without calling the blob store", async () => {
		const member = await memberWithImage("https://img.example/max.png");

		await deleteUserAvatar();

		expect(del).not.toHaveBeenCalled();
		expect(await imageOf(member.id)).toBeNull();
	});

	test("rejects anonymous callers", async () => {
		await createTenant();
		expect(await deleteUserAvatar()).toEqual({
			success: false,
			message: "Nicht authentifiziert",
		});
	});
});
