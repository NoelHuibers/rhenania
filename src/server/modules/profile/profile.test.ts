import { Client } from "@microsoft/microsoft-graph-client";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { getGraphAccessToken } from "~/server/auth/microsoft-tokens";
import { users as controlUsers } from "~/server/db/control-schema";
import { users } from "~/server/db/schema";
import {
	controlDb,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
} from "../../../../test/harness";
import {
	getUserProfile,
	refreshProfile,
	syncFromMicrosoft,
	updateUserName,
} from "./actions";

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

	test("falls back to the signed-in identity when the mirror row is missing (#250)", async () => {
		await createTenant();
		const member = await createUser({ name: "Max" });
		await tenantDb().delete(users).where(eq(users.id, member.id));
		signInAs(member);

		expect(await getUserProfile()).toEqual({
			id: member.id,
			name: "Max",
			email: member.email,
			image: null,
			roles: [],
		});
	});

	test("redirects anonymous visitors to the sign-in page", async () => {
		await createTenant();
		await expect(getUserProfile()).rejects.toThrow("NEXT_REDIRECT");
	});

	test("turns anonymous callers of the mutations away", async () => {
		await createTenant();
		const denied = {
			ok: false,
			error: "Nicht angemeldet",
			code: "UNAUTHENTICATED",
		};
		expect(await updateUserName(form({ name: "x" }))).toEqual(denied);
		expect(await refreshProfile()).toEqual(denied);
		expect(await syncFromMicrosoft()).toEqual(denied);
	});
});

describe("updateUserName", () => {
	test("stores the trimmed name", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);

		expect(await updateUserName(form({ name: "  Max Muster  " }))).toEqual({
			ok: true,
		});
		expect((await mirrorOf(member.id))?.name).toBe("Max Muster");
	});

	test("rejects blank and overlong names", async () => {
		await createTenant();
		const member = await createUser({ name: "Alt" });
		signInAs(member);

		const required = {
			ok: false,
			error: "Bitte gib einen Namen ein",
			code: "INVALID_INPUT",
		};
		expect(await updateUserName(form({ name: "   " }))).toEqual(required);
		expect(await updateUserName(new FormData())).toEqual(required);
		expect(await updateUserName(form({ name: "x".repeat(256) }))).toEqual({
			ok: false,
			error: "Der Name darf höchstens 255 Zeichen lang sein",
			code: "INVALID_INPUT",
		});
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
			ok: true,
			data: {
				message:
					"Profil mit Microsoft abgeglichen. Aktualisiert: Name, Profilbild",
				syncedData: {
					name: "Max Muster",
					hasPhoto: true,
					email: "max@corps.example",
					jobTitle: "Senior",
				},
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

		const result = await syncFromMicrosoft();

		expect(result.ok && result.data.syncedData).toMatchObject({
			name: "Neu",
			hasPhoto: false,
		});
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

		expect(result.ok && result.data.syncedData.hasPhoto).toBe(true);
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

		expect(await syncFromMicrosoft()).toEqual({
			ok: false,
			error: "Abgleich mit Microsoft fehlgeschlagen",
			code: "INTERNAL",
		});
		expect((await mirrorOf(member.id))?.name).toBe("Alt");
	});
});
