import { Client } from "@microsoft/microsoft-graph-client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getGraphAccessToken } from "~/server/auth/microsoft-tokens";
import { users as controlUsers } from "~/server/db/control-schema";
import { userRoles, users } from "~/server/db/schema";
import {
	controlDb,
	createTenant,
	createUser,
	ensureRole,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	getAllRoles,
	getUserProfile,
	refreshProfile,
	syncFromMicrosoft,
	syncFromMicrosoftExtended,
	updateUserAvatar,
	updateUserName,
	updateUserRoles,
} from "./profile";

vi.mock("~/server/auth/microsoft-tokens", () => ({
	getGraphAccessToken: vi.fn(),
}));
vi.mock("@microsoft/microsoft-graph-client", () => ({
	Client: { initWithMiddleware: vi.fn() },
}));

setupTestDatabases();

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	vi.unstubAllGlobals();
});

const form = (values: Record<string, string>) => {
	const data = new FormData();
	for (const [k, v] of Object.entries(values)) {
		data.set(k, v);
	}
	return data;
};

const mirrorOf = async (id: string) =>
	(await tenantDb().select().from(users).where(eq(users.id, id)))[0];

describe("getUserProfile", () => {
	test("returns the member's mirror row and tenant roles", async () => {
		await createTenant();
		const member = await createUser({
			name: "Max",
			roles: ["Fotowart", "Hausbewohner"],
		});
		signInAs(member);

		const profile = await getUserProfile();

		expect(profile).toEqual({
			id: member.id,
			name: "Max",
			email: member.email,
			image: null,
			roles: expect.arrayContaining(["Fotowart", "Hausbewohner"]),
		});
		expect(profile.roles).toHaveLength(2);
	});

	test("redirects anonymous visitors to the sign-in page", async () => {
		await createTenant();
		await expect(getUserProfile()).rejects.toThrow("NEXT_REDIRECT");
		await expect(updateUserName(form({ name: "x" }))).rejects.toThrow(
			"NEXT_REDIRECT",
		);
		await expect(refreshProfile()).rejects.toThrow("NEXT_REDIRECT");
	});

	test("fails when the member has no mirror in this tenant", async () => {
		await createTenant();
		const member = await createUser();
		await tenantDb().delete(users).where(eq(users.id, member.id));
		signInAs(member);

		await expect(getUserProfile()).rejects.toThrow(
			"Failed to fetch user profile",
		);
	});
});

describe("updateUserName", () => {
	test("stores the trimmed name", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);

		expect(await updateUserName(form({ name: "  Max Muster  " }))).toEqual({
			success: true,
			message: "Name updated successfully",
		});
		expect((await mirrorOf(member.id))?.name).toBe("Max Muster");
	});

	test("rejects blank and overlong names", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);

		await expect(updateUserName(form({ name: "   " }))).rejects.toThrow(
			"Name is required",
		);
		await expect(updateUserName(new FormData())).rejects.toThrow(
			"Name is required",
		);
		await expect(
			updateUserName(form({ name: "x".repeat(256) })),
		).rejects.toThrow("Name is too long");
		expect((await mirrorOf(member.id))?.name).toBe("Alt");
	});

	test("a new name is stored on the global identity (#153)", async () => {
		// The control DB is the source of truth; the next mirror fan-out
		// (e.g. verifying an e-mail) would otherwise restore the old name.
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);

		await updateUserName(form({ name: "Neu" }));

		const [identity] = await controlDb()
			.select()
			.from(controlUsers)
			.where(eq(controlUsers.id, member.id));
		expect(identity?.name).toBe("Neu");
	});
});

describe("updateUserAvatar", () => {
	test("stores a valid image URL", async () => {
		await createTenant();
		const member = await createUser();
		signInAs(member);

		await updateUserAvatar(form({ imageUrl: "https://img.example/max.png" }));

		expect((await mirrorOf(member.id))?.image).toBe(
			"https://img.example/max.png",
		);
	});

	test("rejects missing and malformed URLs", async () => {
		await createTenant();
		signInAs(await createUser());

		await expect(updateUserAvatar(form({ imageUrl: " " }))).rejects.toThrow(
			"Image URL is required",
		);
		await expect(
			updateUserAvatar(form({ imageUrl: "not a url" })),
		).rejects.toThrow("Invalid image URL");
	});
});

describe("roles (Admin)", () => {
	test("lists all roles alphabetically", async () => {
		await createTenant();
		await ensureRole("Senior");
		signInAs(await createUser({ roles: ["Admin"] }));

		expect((await getAllRoles()).map((r) => r.name)).toEqual([
			"Admin",
			"Senior",
		]);
	});

	test("replaces a member's roles and records who assigned them", async () => {
		await createTenant();
		const admin = await createUser({ roles: ["Admin"] });
		const member = await createUser({ roles: ["Fuchs"] });
		const senior = await ensureRole("Senior");
		const fm = await ensureRole("Fuchsmajor");
		signInAs(admin);

		await updateUserRoles(member.id, [senior, fm]);
		const rows = await tenantDb()
			.select()
			.from(userRoles)
			.where(eq(userRoles.userId, member.id));
		expect(rows.map((r) => r.roleId).sort()).toEqual([senior, fm].sort());
		expect(rows.every((r) => r.assignedBy === admin.id)).toBe(true);

		await updateUserRoles(member.id, []);
		expect(
			await tenantDb()
				.select()
				.from(userRoles)
				.where(eq(userRoles.userId, member.id)),
		).toHaveLength(0);
	});

	test("members without Admin are refused", async () => {
		await createTenant();
		const member = await createUser({ roles: ["Fuchs"] });
		signInAs(member);

		await expect(getAllRoles()).rejects.toThrow(
			"Unauthorized: Admin access required",
		);
		await expect(updateUserRoles(member.id, [])).rejects.toThrow(
			"Unauthorized: Admin access required",
		);
		expect(
			await tenantDb()
				.select()
				.from(userRoles)
				.where(eq(userRoles.userId, member.id)),
		).toHaveLength(1);
	});
});

describe("syncFromMicrosoft", () => {
	function graphReturns(me: object, photo: object | Error) {
		const api = vi.fn((path: string) => ({
			select: () => ({ get: async () => me }),
			get: async () => {
				if (path !== "/me/photo") {
					return me;
				}
				if (photo instanceof Error) {
					throw photo;
				}
				return photo;
			},
		}));
		vi.mocked(Client.initWithMiddleware).mockReturnValue({ api } as never);
		return api;
	}

	test("takes over the Microsoft display name and photo", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);
		vi.mocked(getGraphAccessToken).mockResolvedValue("graph-token");
		graphReturns(
			{
				displayName: "Max Muster",
				mail: null,
				userPrincipalName: "max@corps.example",
				jobTitle: "Senior",
			},
			{ "@odata.mediaContentType": "image/png" },
		);
		fetchMock.mockResolvedValueOnce(new Response(new Uint8Array([1, 2, 3])));

		const result = await syncFromMicrosoft();

		expect(getGraphAccessToken).toHaveBeenCalledWith(member.id);
		expect(fetchMock).toHaveBeenCalledWith(
			"https://graph.microsoft.com/v1.0/me/photo/$value",
			{ headers: { Authorization: "Bearer graph-token" } },
		);
		expect(result).toMatchObject({
			success: true,
			message:
				"Profile synced from Microsoft successfully. Updated: name, image",
			syncedData: {
				name: "Max Muster",
				hasPhoto: true,
				email: "max@corps.example",
				jobTitle: "Senior",
			},
		});
		expect(await mirrorOf(member.id)).toMatchObject({
			name: "Max Muster",
			image: "data:image/png;base64,AQID",
		});
	});

	test("keeps the current avatar when there is no photo", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);
		vi.mocked(getGraphAccessToken).mockResolvedValue("graph-token");
		graphReturns({ displayName: "Neu" }, new Error("ImageNotFound"));

		const result = await syncFromMicrosoftExtended();

		expect(result.syncedData).toMatchObject({ name: "Neu", hasPhoto: false });
		expect(await mirrorOf(member.id)).toMatchObject({
			name: "Neu",
			image: null,
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	test("syncs a large Microsoft photo (#154)", async () => {
		// Graph returns the largest stored photo; base64-encoding it via
		// String.fromCharCode(...bytes) overflows the call stack above ~120 KB
		// and the photo is silently dropped.
		await createTenant();
		const member = await createUser();
		signInAs(member);
		vi.mocked(getGraphAccessToken).mockResolvedValue("graph-token");
		graphReturns({ displayName: "Max" }, {});
		fetchMock.mockResolvedValueOnce(new Response(new Uint8Array(256 * 1024)));

		const result = await syncFromMicrosoft();

		expect(result.syncedData.hasPhoto).toBe(true);
	});

	test("reports Graph failures without touching the profile", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);
		vi.mocked(getGraphAccessToken).mockResolvedValue("graph-token");
		vi.mocked(Client.initWithMiddleware).mockReturnValue({
			api: () => ({
				select: () => ({
					get: async () => {
						throw new Error("401");
					},
				}),
			}),
		} as never);

		await expect(syncFromMicrosoft()).rejects.toThrow(
			"Failed to sync from Microsoft: Failed to fetch user profile from Microsoft Graph",
		);
		expect((await mirrorOf(member.id))?.name).toBe("Alt");
	});
});
