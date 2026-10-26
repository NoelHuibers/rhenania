import { afterEach, describe, expect, test, vi } from "vitest";

import {
	downloadBase64,
	fileToBase64,
	PDF_MIME,
	XLSX_MIME,
} from "./file-download";

// Minimal browser stand-ins; the suite runs in Node.
function stubBrowser() {
	const anchor = { href: "", download: "", click: vi.fn() };
	vi.stubGlobal("document", { createElement: vi.fn(() => anchor) });
	const createObjectURL = vi
		.spyOn(URL, "createObjectURL")
		.mockReturnValue("blob:download-1");
	const revokeObjectURL = vi
		.spyOn(URL, "revokeObjectURL")
		.mockImplementation(() => {});
	return { anchor, createObjectURL, revokeObjectURL };
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("downloadBase64", () => {
	test("decodes the payload into a typed blob and clicks a download link", async () => {
		const { anchor, createObjectURL, revokeObjectURL } = stubBrowser();
		const bytes = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff]);

		downloadBase64(
			Buffer.from(bytes).toString("base64"),
			"Rechnung.pdf",
			PDF_MIME,
		);

		const blob = createObjectURL.mock.calls[0]?.[0] as Blob;
		expect(blob.type).toBe("application/pdf");
		expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
		expect(anchor).toMatchObject({
			href: "blob:download-1",
			download: "Rechnung.pdf",
		});
		expect(anchor.click).toHaveBeenCalledOnce();
		expect(revokeObjectURL).toHaveBeenCalledWith("blob:download-1");
	});

	test("exposes the spreadsheet MIME type", () => {
		expect(XLSX_MIME).toBe(
			"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		);
	});
});

describe("fileToBase64", () => {
	class FakeFileReader {
		result: string | null = null;
		onload: (() => void) | null = null;
		onerror: ((e: unknown) => void) | null = null;
		readAsDataURL(file: File) {
			void file.arrayBuffer().then((buf) => {
				if (file.name === "broken") {
					this.onerror?.(new Error("read failed"));
					return;
				}
				this.result = `data:${file.type};base64,${Buffer.from(buf).toString("base64")}`;
				this.onload?.();
			});
		}
	}

	test("returns the base64 payload without the data-URL prefix", async () => {
		vi.stubGlobal("FileReader", FakeFileReader);
		const file = new File(["Hallo"], "a.txt", { type: "text/plain" });

		expect(await fileToBase64(file)).toBe(
			Buffer.from("Hallo").toString("base64"),
		);
	});

	test("rejects when the file cannot be read", async () => {
		vi.stubGlobal("FileReader", FakeFileReader);

		await expect(fileToBase64(new File(["x"], "broken"))).rejects.toThrow(
			"read failed",
		);
	});
});
