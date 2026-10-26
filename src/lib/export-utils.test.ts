import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { exportToCSV, printInventoryReport } from "./export-utils";
import type { InventoryItem } from "./types";

const item = (
	name: string,
	overrides: Partial<InventoryItem> = {},
): InventoryItem => ({
	product: {
		id: name,
		name,
		category: "Bier",
		unit: "Flasche",
		cost_per_unit: 0.8,
		created_at: "2026-01-01",
		updated_at: "2026-01-01",
	},
	opening_stock: 10,
	total_purchased: 20,
	total_sold: 25,
	theoretical_stock: 5,
	last_count_quantity: 4,
	last_count_date: "2026-10-01",
	loss_quantity: 1,
	loss_percentage: 20,
	...overrides,
});

let blobs: Blob[];
let link: {
	setAttribute: ReturnType<typeof vi.fn>;
	click: ReturnType<typeof vi.fn>;
	style: object;
};

beforeEach(() => {
	blobs = [];
	link = { setAttribute: vi.fn(), click: vi.fn(), style: {} };
	vi.stubGlobal("document", {
		createElement: () => link,
		body: { appendChild: vi.fn(), removeChild: vi.fn() },
	});
	vi.spyOn(URL, "createObjectURL").mockImplementation((b) => {
		blobs.push(b as Blob);
		return "blob:csv";
	});
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(new Date("2026-10-26T12:00:00Z"));
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
	vi.useRealTimers();
});

async function csvLines() {
	const text = await (blobs[0] as Blob).text();
	return text.split("\n");
}

describe("exportToCSV", () => {
	test("writes a quoted header and one row per item with values", async () => {
		exportToCSV([item("Pils")], "inventur");

		const [header, row] = await csvLines();
		expect(header).toMatch(/^"Product Name","Category","Unit","Cost Per Unit"/);
		expect(row).toBe(
			'"Pils","Bier","Flasche","0.80","10","20","25","5","4","2026-10-01","1","20.00","4.00","0.80"',
		);
		expect(link.setAttribute).toHaveBeenCalledWith(
			"download",
			"inventur-2026-10-26.csv",
		);
		expect(link.click).toHaveBeenCalledOnce();
	});

	test("leaves never-counted fields empty", async () => {
		exportToCSV([
			item("Spezi", { last_count_quantity: null, last_count_date: null }),
		]);

		const [, row] = await csvLines();
		expect(row).toContain('"5","","","1"');
	});

	test("escapes quotes inside values (#57)", async () => {
		exportToCSV([item('Pils "Export"')]);

		const [, row] = await csvLines();
		expect(row?.startsWith('"Pils ""Export""",')).toBe(true);
	});

	test("defuses formulas in product names (#91)", async () => {
		exportToCSV([item("=1+1")]);

		const [, row] = await csvLines();
		expect(row?.startsWith(`"'=1+1","Bier",`)).toBe(true);
	});
});

describe("printInventoryReport", () => {
	test("writes a report with totals into a new window and prints it", () => {
		const win = {
			document: { write: vi.fn(), close: vi.fn() },
			focus: vi.fn(),
			print: vi.fn(),
		};
		vi.stubGlobal("window", { open: vi.fn(() => win) });

		printInventoryReport([item("Pils"), item("Helles", { loss_quantity: 0 })]);

		const html = win.document.write.mock.calls[0]?.[0] as string;
		expect(html).toContain("<td>Pils</td>");
		expect(html).toContain("<td>Helles</td>");
		expect(html).toContain("$8.00"); // stock value 2 × 5 × 0.80
		expect(html).toContain("$0.80"); // loss value 1 × 0.80
		expect(win.print).toHaveBeenCalledOnce();
	});

	test("does nothing when the pop-up is blocked", () => {
		vi.stubGlobal("window", { open: vi.fn(() => null) });
		expect(() => printInventoryReport([item("Pils")])).not.toThrow();
	});
});
