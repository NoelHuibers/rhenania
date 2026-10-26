import { upload } from "@vercel/blob/client";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
	uploadDrinkImage,
	validateImageFile as validateDrinkImage,
} from "./blob-upload";
import {
	uploadHomepageImage,
	validateImageFile as validateHomepageImage,
} from "./image-upload";
import { uploadReceipt, validateReceiptFile } from "./receipt-upload";

vi.mock("@vercel/blob/client", () => ({ upload: vi.fn() }));

const MB = 1024 * 1024;
const file = (type: string, size = 1024, name = "bild.jpg") =>
	new File([new Uint8Array(size)], name, { type });

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
	vi.mocked(upload).mockReset();
	vi.mocked(upload).mockImplementation(async (pathname, _body, opts) => {
		opts?.onUploadProgress?.({ loaded: 50, total: 200, percentage: 25 });
		return { url: `https://blob.example/${pathname}` } as never;
	});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
});

const TS = new Date("2026-10-26T12:00:00Z").getTime();

describe("client-side validation", () => {
	test("drink images: JPEG/PNG/WebP up to 5 MB", () => {
		expect(validateDrinkImage(file("image/webp", 5 * MB))).toBe(true);
		expect(() => validateDrinkImage(file("image/png", 5 * MB + 1))).toThrow(
			"Bild ist zu groß. Maximale Größe: 5MB",
		);
		expect(() => validateDrinkImage(file("image/gif"))).toThrow(
			"Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP",
		);
	});

	test("homepage images: up to 10 MB", () => {
		expect(validateHomepageImage(file("image/jpeg", 10 * MB))).toBe(true);
		expect(() =>
			validateHomepageImage(file("image/jpeg", 10 * MB + 1)),
		).toThrow("Bild ist zu groß. Maximale Größe: 10MB");
		expect(() => validateHomepageImage(file("image/gif"))).toThrow(
			/Ungültiger Dateityp/,
		);
	});

	test("receipts: images or PDF up to 10 MB", () => {
		expect(validateReceiptFile(file("application/pdf", 10 * MB))).toBe(true);
		expect(() =>
			validateReceiptFile(file("application/pdf", 10 * MB + 1)),
		).toThrow("Datei ist zu groß. Maximale Größe: 10MB");
		expect(() => validateReceiptFile(file("text/plain"))).toThrow(
			"Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP, PDF",
		);
	});
});

describe("uploads go to the tenant's blob namespace", () => {
	test("drink image", async () => {
		const onProgress = vi.fn();

		const url = await uploadDrinkImage(file("image/png", 10, "pils.png"), {
			tenantSlug: "hassia",
			onProgress,
		});

		expect(upload).toHaveBeenCalledWith(
			`tenants/hassia/drinks/${TS}-pils.png`,
			expect.any(File),
			expect.objectContaining({
				access: "public",
				handleUploadUrl: "/api/upload",
			}),
		);
		expect(url).toBe(
			`https://blob.example/tenants/hassia/drinks/${TS}-pils.png`,
		);
		expect(onProgress).toHaveBeenCalledWith(25);
	});

	test("homepage image, per section", async () => {
		await uploadHomepageImage(file("image/jpeg", 10, "haus.jpg"), {
			tenantSlug: "hassia",
			section: "haus",
		});

		expect(vi.mocked(upload).mock.lastCall?.[0]).toBe(
			`tenants/hassia/homepage/haus/${TS}-haus.jpg`,
		);
	});

	test("receipt", async () => {
		await uploadReceipt(file("application/pdf", 10, "beleg.pdf"), {
			tenantSlug: "hassia",
		});

		expect(vi.mocked(upload).mock.lastCall?.[0]).toBe(
			`tenants/hassia/receipts/${TS}-beleg.pdf`,
		);
	});

	test("invalid files never reach the blob store", async () => {
		await expect(
			uploadDrinkImage(file("image/gif"), { tenantSlug: "hassia" }),
		).rejects.toThrow(/Ungültiger Dateityp/);
		await expect(
			uploadHomepageImage(file("image/jpeg", 11 * MB), {
				tenantSlug: "hassia",
				section: "header",
			}),
		).rejects.toThrow(/zu groß/);
		await expect(
			uploadReceipt(file("text/plain"), { tenantSlug: "hassia" }),
		).rejects.toThrow(/Ungültiger Dateityp/);
		expect(upload).not.toHaveBeenCalled();
	});

	test("upload failures are reported in German", async () => {
		vi.mocked(upload).mockRejectedValue(new Error("403"));

		await expect(
			uploadDrinkImage(file("image/png"), { tenantSlug: "hassia" }),
		).rejects.toThrow("Fehler beim Hochladen des Bildes: Error: 403");
		await expect(
			uploadHomepageImage(file("image/png"), {
				tenantSlug: "hassia",
				section: "footer",
			}),
		).rejects.toThrow("Fehler beim Hochladen des Bildes: Error: 403");
		await expect(
			uploadReceipt(file("image/png"), { tenantSlug: "hassia" }),
		).rejects.toThrow("Fehler beim Hochladen des Belegs: Error: 403");
	});
});
