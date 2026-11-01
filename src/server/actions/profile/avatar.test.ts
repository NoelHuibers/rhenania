import { del } from "@vercel/blob";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { users } from "~/server/db/schema";
import { checkAndUnlockAchievements } from "~/server/modules/achievements/tracking";
import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import { testState } from "../../../../test/state";
import { deleteUserAvatar, updateUserAvatarUrl } from "./avatar";

vi.mock("@vercel/blob", () => ({ del: vi.fn() }));
vi.mock("~/server/modules/achievements/tracking", () => ({
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

describe("updateUserAvatarUrl", () => {
	test("stores the uploaded avatar and replaces the previous blob", async () => {
		const member = await memberWithImage((id) => `${own(id)}/old.png`);
		const data = new FormData();
		data.set("imageUrl", `${own(member.id)}/new.png`);

		const result = await updateUserAvatarUrl(data);

		expect(result).toEqual({
			ok: true,
			data: { imageUrl: `${own(member.id)}/new.png` },
		});
		expect(del).toHaveBeenCalledWith(`${own(member.id)}/old.png`);
		expect(await imageOf(member.id)).toBe(`${own(member.id)}/new.png`);
		expect(checkAndUnlockAchievements).toHaveBeenCalledWith(
			expect.objectContaining({ tenantId: testState.tenantId }),
			member.id,
			"profile_picture_set",
		);
		expect(revalidatePath).toHaveBeenCalledWith("/profile");
	});

	test("never deletes a blob outside the caller's own avatar folder", async () => {
		// e.g. another member's photo or a receipt, set as avatar on purpose
		await memberWithImage(`${BLOB}/someone-else/photo.png`);
		const data = new FormData();
		data.set("imageUrl", "https://img.example/me.png");

		expect((await updateUserAvatarUrl(data)).ok).toBe(true);
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
			expect(await updateUserAvatarUrl(data)).toEqual({
				ok: false,
				error: "Nur https-Bild-URLs sind erlaubt",
				code: "INVALID_INPUT",
			});
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

		expect((await updateUserAvatarUrl(data)).ok).toBe(true);
		expect(await imageOf(member.id)).toBe(`${BLOB}/new.png`);
	});

	test("requires a signed-in member and an image URL", async () => {
		await createTenant();
		expect(await updateUserAvatarUrl(new FormData())).toEqual({
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		});

		signInAs(await createUser());
		expect(await updateUserAvatarUrl(new FormData())).toEqual({
			ok: false,
			error: "Keine Bild-URL angegeben",
			code: "INVALID_INPUT",
		});
	});
});

describe("deleteUserAvatar", () => {
	test("removes the blob and clears the image", async () => {
		const member = await memberWithImage((id) => `${own(id)}/old.png`);

		expect(await deleteUserAvatar()).toEqual({ ok: true });
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
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		});
	});
});
