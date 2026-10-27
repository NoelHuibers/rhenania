import { handleUpload } from "@vercel/blob/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
} from "../../../../test/harness";
import { POST } from "./route";

// The Blob SDK is replaced by a stand-in that only runs the route's
// `onBeforeGenerateToken` for the requested pathname, like the real SDK does
// before it signs a client token.
vi.mock("@vercel/blob/client", () => ({ handleUpload: vi.fn() }));

setupTestDatabases();

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.mocked(handleUpload).mockImplementation(async (opts) => {
		const body = opts.body as { payload: { pathname: string } };
		const options = await opts.onBeforeGenerateToken(
			body.payload.pathname,
			null,
			false,
		);
		return {
			type: "blob.generate-client-token",
			clientToken: "token",
			options,
		} as never;
	});
});

afterEach(() => {
	vi.unstubAllEnvs();
});

function uploadRequest(pathname: string) {
	return new Request("http://hassia.test.localhost/api/upload", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			type: "blob.generate-client-token",
			payload: {
				pathname,
				callbackUrl: "",
				clientPayload: null,
				multipart: false,
			},
		}),
	});
}

async function asMember(roles: string[] = []) {
	await createTenant({ slug: "hassia" });
	const user = await createUser({ roles });
	signInAs(user);
	return user;
}

describe("POST /api/upload", () => {
	test("rejects requests without a resolved tenant", async () => {
		const res = await POST(uploadRequest("tenants/hassia/profile/me.png"));

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({
			error: "Tenant not resolved for upload request",
		});
		expect(handleUpload).not.toHaveBeenCalled();
	});

	test("rejects paths outside the tenant's blob namespace", async () => {
		await asMember();

		for (const pathname of [
			"tenants/rhenania/profile/me.png",
			"profile/me.png",
			"tenants/hassia-evil/profile/me.png",
		]) {
			const res = await POST(uploadRequest(pathname));
			expect(res.status).toBe(400);
			expect((await res.json()).error).toBe(
				`Upload path must start with 'tenants/hassia/' (got: ${pathname})`,
			);
		}
	});

	test("rejects unknown folders inside the namespace", async () => {
		await asMember();

		const res = await POST(uploadRequest("tenants/hassia/backups/db.sqlite"));

		expect(res.status).toBe(400);
		expect(await res.json()).toEqual({ error: "Unauthorized upload path" });
	});

	test("issues size-limited, randomly suffixed tokens per folder", async () => {
		const me = await asMember(["Fotowart", "Getränkewart"]);
		const optionsFor = async (pathname: string) =>
			(await (await POST(uploadRequest(pathname))).json()).options;

		expect(await optionsFor(`/tenants/hassia/profile/${me.id}/me.png`)).toEqual(
			{
				allowedContentTypes: [
					"image/jpeg",
					"image/jpg",
					"image/png",
					"image/webp",
				],
				maximumSizeInBytes: 5 * 1024 * 1024,
				addRandomSuffix: true,
			},
		);
		expect(await optionsFor("tenants/hassia/drinks/pils.webp")).toMatchObject({
			maximumSizeInBytes: 5 * 1024 * 1024,
			addRandomSuffix: true,
		});
		expect(
			await optionsFor("tenants/hassia/homepage/header/1.jpg"),
		).toMatchObject({
			maximumSizeInBytes: 10 * 1024 * 1024,
			addRandomSuffix: true,
		});
		const receipts = await optionsFor("tenants/hassia/receipts/beleg.pdf");
		expect(receipts.allowedContentTypes).toContain("application/pdf");
		expect(receipts.maximumSizeInBytes).toBe(10 * 1024 * 1024);
		const homepage = await optionsFor("tenants/hassia/homepage/header/2.jpg");
		expect(homepage.allowedContentTypes).not.toContain("image/svg+xml");
	});

	test("folders are limited to the roles that manage them", async () => {
		const me = await asMember();
		const status = async (pathname: string) =>
			(await POST(uploadRequest(pathname))).status;

		expect(await status(`tenants/hassia/profile/${me.id}/me.png`)).toBe(200);
		expect(await status("tenants/hassia/receipts/beleg.pdf")).toBe(200);
		expect(await status("tenants/hassia/homepage/header/1.jpg")).not.toBe(200);
		expect(await status("tenants/hassia/drinks/pils.webp")).not.toBe(200);
		// avatars only in the uploader's own folder
		expect(await status("tenants/hassia/profile/someone-else/me.png")).not.toBe(
			200,
		);
	});

	test("hands the Blob token from the environment to the SDK", async () => {
		const me = await asMember();
		vi.stubEnv("ACME_READ_WRITE_TOKEN", "vercel_blob_rw_custom");
		vi.stubEnv("OTHER_READ_WRITE_TOKEN", "not-a-blob-token");

		await POST(uploadRequest(`tenants/hassia/profile/${me.id}/me.png`));

		expect(vi.mocked(handleUpload).mock.lastCall?.[0].token).toBe(
			"vercel_blob_rw_custom",
		);
	});
});
