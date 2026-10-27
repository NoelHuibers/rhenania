import { del, list, put } from "@vercel/blob";
import { strFromU8, unzipSync } from "fflate";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { billPDFs } from "~/server/db/schema";
import {
	createBill,
	grantSuperAdmin,
} from "../../../../test/factories/platform";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	switchTenant,
	tenantDb,
} from "../../../../test/harness";
import { exportTenantData } from "./export";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), list: vi.fn(), del: vi.fn() }));

setupTestDatabases();

const putMock = vi.mocked(put);
const listMock = vi.mocked(list);
const delMock = vi.mocked(del);

/** What the mocked Blob store received, unzipped. */
let uploaded: Record<string, Uint8Array> = {};

beforeEach(() => {
	uploaded = {};
	vi.spyOn(console, "info").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
	putMock.mockImplementation(async (pathname, body) => {
		// Read the stream like the real multipart upload does.
		const bytes = await new Response(body as ReadableStream).arrayBuffer();
		uploaded = unzipSync(new Uint8Array(bytes));
		const url = `https://store1.public.blob.vercel-storage.com/${pathname.replace(".zip", "-AbC123.zip")}`;
		return {
			url,
			downloadUrl: `${url}?download=1`,
			pathname,
			contentType: "application/zip",
			contentDisposition: "attachment",
			etag: "etag",
		};
	});
	listMock.mockResolvedValue({ blobs: [], hasMore: false } as Awaited<
		ReturnType<typeof list>
	>);
	delMock.mockResolvedValue(undefined);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function file(name: string): string {
	const data = uploaded[name];
	if (!data) {
		throw new Error(`${name} not in the uploaded ZIP`);
	}
	return strFromU8(data);
}

describe("who may export", () => {
	test("a tenant Admin gets a download link to the ZIP", async () => {
		const tenant = await createTenant({ slug: "rhenania" });
		signInAs(await createUser({ roles: ["Admin"] }));
		await createDrink({ name: "Rhenania-Pils", price: 1.2 });

		const result = await exportTenantData();

		expect(result).toMatchObject({
			success: true,
			url: expect.stringMatching(
				/^https:\/\/store1\.public\.blob\.vercel-storage\.com\/tenants\/rhenania\/exports\/rhenania-export-\d{4}-\d\d-\d\dT\d\d-\d\d-\d\dZ-AbC123\.zip\?download=1$/,
			),
			fileName: expect.stringMatching(/^rhenania-export-.*\.zip$/),
			files: 0,
			missingFiles: 0,
		});
		expect(result.success && result.tables).toBeGreaterThan(40);
		expect(putMock).toHaveBeenCalledTimes(1);
		const [pathname, , options] = putMock.mock.calls[0] ?? [];
		expect(pathname).toMatch(/^tenants\/rhenania\/exports\//);
		expect(options).toMatchObject({
			access: "public",
			addRandomSuffix: true,
			multipart: true,
			contentType: "application/zip",
			cacheControlMaxAge: 60,
		});
		expect(file("tabellen/drink.csv")).toContain("Rhenania-Pils;1.2;");
		expect(file("README.txt")).toContain(`Datenexport: ${tenant.displayName}`);
	});

	test("a member without the Admin role is refused", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart", "Senior"] }));

		expect(await exportTenantData()).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect(putMock).not.toHaveBeenCalled();
		expect(listMock).not.toHaveBeenCalled();
	});

	test("an Admin of another Corps is refused", async () => {
		const own = await createTenant({ slug: "own" });
		const foreign = await createTenant({ slug: "foreign" });
		const admin = await createUser({ roles: ["Admin"], tenantId: foreign.id });
		switchTenant(own);
		signInAs(admin);

		expect(await exportTenantData()).toEqual({
			success: false,
			error: "Keine Berechtigung",
		});
		expect(putMock).not.toHaveBeenCalled();
	});

	test("nobody signed in is refused", async () => {
		await createTenant();
		expect(await exportTenantData()).toEqual({
			success: false,
			error: "Nicht angemeldet",
		});
	});

	test("a superadmin may export any Corps", async () => {
		await createTenant({ slug: "hassia" });
		const superadmin = await createUser({ tenantId: null });
		await grantSuperAdmin(superadmin.id);
		signInAs(superadmin);

		const result = await exportTenantData();
		expect(result.success).toBe(true);
		expect(putMock.mock.calls[0]?.[0]).toMatch(/^tenants\/hassia\/exports\//);
	});
});

describe("what is exported", () => {
	test("only the current Corps' data", async () => {
		const other = await createTenant({ slug: "other" });
		const own = await createTenant({ slug: "own" });
		await createDrink({ name: "Fremdbräu" }, other.id);
		await createUser({ name: "Fremder Fuchs", tenantId: other.id });
		switchTenant(own);
		signInAs(await createUser({ name: "Eigener Admin", roles: ["Admin"] }));
		await createDrink({ name: "Eigenbräu" });

		await exportTenantData();

		const all = Object.values(uploaded)
			.map((f) => strFromU8(f))
			.join("\n");
		expect(all).toContain("Eigenbräu");
		expect(all).toContain("Eigener Admin");
		expect(all).not.toContain("Fremdbräu");
		expect(all).not.toContain("Fremder Fuchs");
	});

	test("a stored file that is gone is listed in the README", async () => {
		await createTenant();
		const admin = await createUser({ roles: ["Admin"] });
		signInAs(admin);
		const { bill } = await createBill({ userId: admin.id });
		const blobUrl =
			"https://store1.public.blob.vercel-storage.com/tenants/x/bills/weg.pdf";
		await tenantDb().insert(billPDFs).values({
			billId: bill.id,
			userId: admin.id,
			blobUrl,
			fileName: "weg.pdf",
			fileSize: 10,
		});
		const fetchMock = vi.fn(async () => new Response("", { status: 404 }));
		vi.stubGlobal("fetch", fetchMock);

		const result = await exportTenantData();

		expect(result).toMatchObject({ success: true, files: 0, missingFiles: 1 });
		expect(fetchMock).toHaveBeenCalledWith(
			blobUrl,
			expect.objectContaining({ redirect: "error" }),
		);
		const readme = file("README.txt");
		expect(readme).toContain("1 Dateien konnten nicht übernommen werden.");
		expect(readme).toContain(blobUrl);
		expect(file("tabellen/bill_pdf.csv")).toContain(blobUrl);
	});
});

describe("expiry and failures", () => {
	test("exports older than 24 h under the tenant's prefix are deleted", async () => {
		await createTenant({ slug: "corps" });
		signInAs(await createUser({ roles: ["Admin"] }));
		const ago = (h: number) => new Date(Date.now() - h * 60 * 60 * 1000);
		const blob = (name: string, uploadedAt: Date) => ({
			pathname: `tenants/corps/exports/${name}`,
			url: `https://s.public.blob.vercel-storage.com/tenants/corps/exports/${name}`,
			downloadUrl: "",
			size: 1,
			uploadedAt,
			etag: "e",
		});
		listMock
			.mockResolvedValueOnce({
				blobs: [blob("alt.zip", ago(25)), blob("neu.zip", ago(1))],
				hasMore: true,
				cursor: "c1",
			} as Awaited<ReturnType<typeof list>>)
			.mockResolvedValueOnce({
				blobs: [blob("uralt.zip", ago(24 * 30))],
				hasMore: false,
			} as Awaited<ReturnType<typeof list>>);

		const result = await exportTenantData();

		expect(result.success).toBe(true);
		expect(listMock).toHaveBeenNthCalledWith(1, {
			prefix: "tenants/corps/exports/",
			cursor: undefined,
		});
		expect(listMock).toHaveBeenNthCalledWith(2, {
			prefix: "tenants/corps/exports/",
			cursor: "c1",
		});
		expect(delMock).toHaveBeenCalledWith([
			"https://s.public.blob.vercel-storage.com/tenants/corps/exports/alt.zip",
			"https://s.public.blob.vercel-storage.com/tenants/corps/exports/uralt.zip",
		]);
	});

	test("nothing young is deleted, and a failing cleanup doesn't stop the export", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		listMock.mockRejectedValueOnce(new Error("blob down"));

		expect((await exportTenantData()).success).toBe(true);
		expect(delMock).not.toHaveBeenCalled();
		expect(console.warn).toHaveBeenCalledWith(
			expect.stringContaining("cleanup failed"),
		);
	});

	test("a failed upload returns an error instead of throwing", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Admin"] }));
		putMock.mockRejectedValueOnce(new Error("quota exceeded"));

		expect(await exportTenantData()).toEqual({
			success: false,
			error: "Der Export ist fehlgeschlagen. Bitte später erneut versuchen.",
		});
		expect(console.error).toHaveBeenCalledWith(
			expect.stringContaining("quota exceeded"),
		);
	});
});
