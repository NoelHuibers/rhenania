import { head, put } from "@vercel/blob";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { billCSVs } from "~/server/db/schema";
import {
	createBillPeriodRow,
	createBillRow,
	eventUser,
} from "../../../../test/factories/billing";
import {
	createDrink,
	createTenant,
	setupTestDatabases,
	tenantDb,
} from "../../../../test/harness";
import { generateBillPeriodCSV } from "./createCSV";
import { saveBillPeriodCSV } from "./saveBillCSV";

vi.mock("@vercel/blob", () => ({ put: vi.fn(), head: vi.fn() }));

setupTestDatabases();

const putMock = vi.mocked(put);
const headMock = vi.mocked(head);

beforeEach(() => {
	vi.spyOn(console, "error").mockImplementation(() => {});
	vi.spyOn(console, "warn").mockImplementation(() => {});
	putMock.mockImplementation(async (pathname) => ({
		url: `https://blob.test/${pathname}`,
		downloadUrl: `https://blob.test/${pathname}?download=1`,
		pathname: String(pathname),
		contentType: "text/csv",
		contentDisposition: "inline",
		etag: "etag",
	}));
	headMock.mockResolvedValue({} as Awaited<ReturnType<typeof head>>);
});

const MONEY_HEADERS = ["Rechnungsbetrag", "Alte Rechnung", "Mahnung"];

/** Splits a CSV produced with `;` whose cells contain no quoted `;`. */
function cells(line: string | undefined) {
	return (line ?? "").split(";");
}

function euro(cell: string | undefined) {
	return Number((cell ?? "").replace(" EUR", "").replace(",", "."));
}

async function periodWithBills() {
	await createDrink({ name: "Pils", price: 1.5 });
	await createDrink({ name: "Wasser", price: 1 });
	await createDrink({ name: "Helles", price: 1.8 });
	const period = await createBillPeriodRow({
		billNumber: "KW-43-26",
		createdAt: new Date("2026-10-21T12:00:00Z"),
	});
	await createBillRow({
		periodId: period.id,
		user: { id: "u-zed", name: "Zed" },
		drinksTotal: 3,
		oldBillingAmount: 20,
		fees: 2,
		items: [{ drinkName: "Pils", amount: 2, pricePerDrink: 1.5 }],
	});
	await createBillRow({
		periodId: period.id,
		user: eventUser("CC"),
		drinksTotal: 9,
		items: [{ drinkName: "Pils", amount: 6, pricePerDrink: 1.5 }],
	});
	await createBillRow({
		periodId: period.id,
		user: { id: "u-anna", name: "Anna" },
		status: "Bezahlt",
		drinksTotal: 1,
		items: [{ drinkName: "Wasser", amount: 1, pricePerDrink: 1 }],
	});
	await createBillRow({
		periodId: period.id,
		user: { id: "u-max", name: 'Max "Lucky" Muster; Jr' },
	});
	return period;
}

describe("generateBillPeriodCSV", () => {
	test("lays out one row per bill, groups first, with price and total rows", async () => {
		await createTenant();
		const period = await periodWithBills();

		const result = await generateBillPeriodCSV(period.id, {
			delimiter: ";",
			paypalBaseUrl: "https://paypal.me/kasse",
		});

		expect(result).toMatchObject({
			success: true,
			fileName: "Rechnung_KW-43-26.csv",
			billCount: 4,
			drinkColumns: ["Helles", "Pils", "Wasser"],
		});
		const lines = (result.csvContent ?? "").split("\n");
		expect(lines[0]).toBe(
			'Name;Helles;Pils;Wasser;Rechnungsbetrag;Alte Rechnung;Mahnung;Zu zahlender Betrag;nix;Mahnfaktor;PayPal Link;"Wenn Bezahlt ""Bezahlt"" eintragen"',
		);
		expect(lines[1]).toBe(
			"CC;0;6;0;9,00 EUR;0,00 EUR;0,00 EUR;9,00 EUR;CC;0,00 %;https://paypal.me/kasse/9.00EUR;",
		);
		expect(lines[2]).toBe(
			"Anna;0;0;1;1,00 EUR;0,00 EUR;0,00 EUR;1,00 EUR;Anna;0,00 %;#####;Bezahlt",
		);
		// Names containing the delimiter or quotes are quoted and escaped.
		expect(lines[3]?.startsWith('"Max ""Lucky"" Muster; Jr";0;0;0;')).toBe(
			true,
		);
		expect(lines[3]).toContain(";#####;");
		const zed = cells(lines[4]);
		expect(zed.slice(0, 8)).toEqual([
			"Zed",
			"0",
			"2",
			"0",
			"3,00 EUR",
			"20,00 EUR",
			"2,00 EUR",
			"25,00 EUR",
		]);
		expect(zed[10]).toBe("https://paypal.me/kasse/25.00EUR");
		expect(lines[5]).toBe(";".repeat(11));
		expect(lines[6]).toBe("Preis/Einheit;1,80 EUR;1,50 EUR;1,00 EUR;;;;;;;;");
		expect(lines[7]).toBe(
			"GESAMT;0;8;1;13,00 EUR;20,00 EUR;2,00 EUR;35,00 EUR;;;;",
		);
		expect(lines).toHaveLength(8);
	});

	test("defaults to comma-separated output with quoted amounts", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "Solo" },
			drinksTotal: 4.5,
		});

		const result = await generateBillPeriodCSV(period.id);

		const lines = (result.csvContent ?? "").split("\n");
		expect(lines[0]?.startsWith("Name,Rechnungsbetrag,")).toBe(true);
		expect(lines[1]).toBe(
			'Solo,"4,50 EUR","0,00 EUR","0,00 EUR","4,50 EUR",Solo,"0,00 %",https://paypal.me/YourHandle/4.50EUR,',
		);
	});

	test("reports unknown periods and periods without bills", async () => {
		await createTenant();
		const empty = await createBillPeriodRow();

		expect(await generateBillPeriodCSV("missing")).toEqual({
			success: false,
			error: "Bill period with ID missing not found",
		});
		expect(await generateBillPeriodCSV(empty.id)).toEqual({
			success: false,
			error: `No bills found for bill period ${empty.id}`,
		});
	});

	// New: Mahnfaktor divides the fee by the drinks total instead of the
	// carried-over amount it was charged on (shows 66,67 % here).
	test.fails("reports the Mahnfaktor relative to the carried-over amount (new)", async () => {
		await createTenant();
		const period = await periodWithBills();

		const result = await generateBillPeriodCSV(period.id, { delimiter: ";" });

		const zed = (result.csvContent ?? "")
			.split("\n")
			.find((line) => line.startsWith("Zed;"));
		expect(cells(zed)[9]).toBe("10,00 %");
	});

	// New: there is no Umlage column, so a row with Umlage does not add up to
	// its "Zu zahlender Betrag".
	test.fails("money columns add up to the amount due when an Umlage was charged (new)", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "Resident" },
			drinksTotal: 3,
			umlage: 5,
		});

		const result = await generateBillPeriodCSV(period.id, { delimiter: ";" });

		const [header, row] = (result.csvContent ?? "").split("\n").map(cells);
		const due = euro(row?.[header?.indexOf("Zu zahlender Betrag") ?? -1]);
		const parts = (header ?? [])
			.map((name, i) =>
				[...MONEY_HEADERS, "Umlage"].includes(name) ? euro(row?.[i]) : 0,
			)
			.reduce((a, b) => a + b, 0);
		expect(due).toBe(8);
		expect(parts).toBe(due);
	});
});

describe("saveBillPeriodCSV", () => {
	test("uploads the CSV under the tenant prefix and records it", async () => {
		const tenant = await createTenant();
		const period = await periodWithBills();

		const result = await saveBillPeriodCSV(period.id, { delimiter: ";" });

		const path = `tenants/${tenant.slug}/bills/Rechnung_21_Okt_2026.csv`;
		expect(result).toMatchObject({
			success: true,
			downloadUrl: `https://blob.test/${path}`,
			fileName: path,
			wasExisting: false,
		});
		const [pathname, content, options] = putMock.mock.calls[0] ?? [];
		expect(pathname).toBe(path);
		expect(String(content).startsWith("Name;Helles;Pils;Wasser;")).toBe(true);
		expect(options).toEqual({
			access: "public",
			contentType: "text/csv;charset=utf-8",
		});
		const [row] = await tenantDb().select().from(billCSVs);
		expect(row).toMatchObject({
			id: result.csvId,
			billPeriodId: period.id,
			blobUrl: `https://blob.test/${path}`,
			delimiter: ";",
			fileSize: Buffer.byteLength(String(content)),
		});
	});

	test("returns the stored CSV while its blob exists and regenerates once it is gone", async () => {
		await createTenant();
		const period = await periodWithBills();
		const first = await saveBillPeriodCSV(period.id);

		const cached = await saveBillPeriodCSV(period.id);
		expect(cached).toMatchObject({ wasExisting: true, csvId: first.csvId });
		expect(putMock).toHaveBeenCalledTimes(1);

		headMock.mockRejectedValueOnce(new Error("BlobNotFoundError"));
		const regenerated = await saveBillPeriodCSV(period.id);

		expect(regenerated).toMatchObject({ success: true, wasExisting: false });
		expect(putMock).toHaveBeenCalledTimes(2);
		const rows = await tenantDb().select().from(billCSVs);
		expect(rows.map((r) => r.id)).toEqual([regenerated.csvId]);
	});

	test("uploads nothing when the period has no bills", async () => {
		await createTenant();
		const period = await createBillPeriodRow();

		const result = await saveBillPeriodCSV(period.id);

		expect(result.success).toBe(false);
		expect(putMock).not.toHaveBeenCalled();
		expect(await tenantDb().select().from(billCSVs)).toHaveLength(0);
	});

	// New: without options the record says ";" but the content is generated
	// with createCSV's own default ",". The Kasse UI calls it without options.
	test.fails("writes the CSV with the delimiter it records (new)", async () => {
		await createTenant();
		const period = await periodWithBills();

		await saveBillPeriodCSV(period.id);

		const [row] = await tenantDb().select().from(billCSVs);
		const content = String(putMock.mock.calls[0]?.[1]);
		expect(row?.delimiter).toBe(";");
		expect(content.startsWith("Name;")).toBe(true);
	});
});
