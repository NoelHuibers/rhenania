import { head, put } from "@vercel/blob";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { billCSVs } from "~/server/db/schema";
import { periodCsv } from "~/server/modules/billing/service";
import {
	createBillPeriodRow,
	createBillRow,
	eventUser,
	setUpGetraenkeBilling,
} from "../../../../test/factories/billing";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	signInAs,
	tenantDb,
	testScope,
} from "../../../../test/harness";
import { useServerTimeZone } from "../../../../test/server-tz";
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

async function periodWithBills(createdAt = new Date("2026-10-21T12:00:00Z")) {
	await createDrink({ name: "Pils", price: 1.5 });
	await createDrink({ name: "Wasser", price: 1 });
	await createDrink({ name: "Helles", price: 1.8 });
	const period = await createBillPeriodRow({
		billNumber: "KW-43-26",
		createdAt,
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

describe("periodCsv", () => {
	test("lays out one row per bill, groups first, with price and total rows", async () => {
		await createTenant();
		const period = await periodWithBills();

		const result = await periodCsv(testScope(), period.id, {
			delimiter: ";",
			paypalBaseUrl: "https://paypal.me/kasse",
		});

		expect(result).toMatchObject({
			fileName: "Rechnung_KW-43-26.csv",
			billCount: 4,
			drinkColumns: ["Helles", "Pils", "Wasser"],
		});
		const lines = (result.csvContent ?? "").split("\n");
		expect(lines[0]).toBe(
			'Name;Helles;Pils;Wasser;Rechnungsbetrag;Alte Rechnung;Mahnung;Umlage;Zu zahlender Betrag;nix;Mahnfaktor;PayPal Link;"Wenn Bezahlt ""Bezahlt"" eintragen"',
		);
		expect(lines[1]).toBe(
			"CC;0;6;0;9,00 EUR;0,00 EUR;0,00 EUR;0,00 EUR;9,00 EUR;CC;0,00 %;https://paypal.me/kasse/9.00EUR;",
		);
		expect(lines[2]).toBe(
			"Anna;0;0;1;1,00 EUR;0,00 EUR;0,00 EUR;0,00 EUR;1,00 EUR;Anna;0,00 %;#####;Bezahlt",
		);
		// Names containing the delimiter or quotes are quoted and escaped.
		expect(lines[3]?.startsWith('"Max ""Lucky"" Muster; Jr";0;0;0;')).toBe(
			true,
		);
		expect(lines[3]).toContain(";#####;");
		const zed = cells(lines[4]);
		expect(zed.slice(0, 9)).toEqual([
			"Zed",
			"0",
			"2",
			"0",
			"3,00 EUR",
			"20,00 EUR",
			"2,00 EUR",
			"0,00 EUR",
			"25,00 EUR",
		]);
		expect(zed[11]).toBe("https://paypal.me/kasse/25.00EUR");
		expect(lines[5]).toBe(";".repeat(12));
		expect(lines[6]).toBe("Preis/Einheit;1,80 EUR;1,50 EUR;1,00 EUR;;;;;;;;;");
		expect(lines[7]).toBe(
			"GESAMT;0;8;1;13,00 EUR;20,00 EUR;2,00 EUR;0,00 EUR;35,00 EUR;;;;",
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

		const result = await periodCsv(testScope(), period.id);

		const lines = (result.csvContent ?? "").split("\n");
		expect(lines[0]?.startsWith("Name,Rechnungsbetrag,")).toBe(true);
		// No PayPal configured: no link, and never a placeholder handle (#9).
		expect(lines[1]).toBe(
			'Solo,"4,50 EUR","0,00 EUR","0,00 EUR","0,00 EUR","4,50 EUR",Solo,"0,00 %",,',
		);
	});

	test("links the tenant's own PayPal by default (#9)", async () => {
		await createTenant();
		await setUpGetraenkeBilling();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "Solo" },
			drinksTotal: 4.5,
		});

		const result = await periodCsv(testScope(), period.id);

		expect(result.csvContent?.split("\n")[1]).toMatch(
			/,https:\/\/paypal\.me\/corpskasse\/4\.50EUR,$/,
		);
	});

	test("defuses formulas in names but keeps negative amounts (#91)", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: '=HYPERLINK("http://x","Klick")' },
			drinksTotal: 2,
			oldBillingAmount: -5,
		});
		await createBillRow({
			periodId: period.id,
			user: { id: "u2", name: "@Admin" },
			drinksTotal: 1,
		});

		const result = await periodCsv(testScope(), period.id, { delimiter: ";" });

		const rows = (result.csvContent ?? "").split("\n").map((l) => l.split(";"));
		const hyperlink = rows.find((r) => r[0]?.includes("HYPERLINK"));
		expect(hyperlink?.[0]).toBe('"\'=HYPERLINK(""http://x"",""Klick"")"');
		expect(hyperlink?.slice(1, 6)).toEqual([
			"2,00 EUR",
			"-5,00 EUR",
			"0,00 EUR",
			"0,00 EUR",
			"-3,00 EUR",
		]);
		expect(rows.find((r) => r[0]?.includes("Admin"))?.[0]).toBe("'@Admin");
		// No cell anywhere starts with a formula character, except numbers.
		for (const cell of rows.flat()) {
			expect(cell.replace(/^"/, "")).not.toMatch(/^[=+@\t\r]/);
			if (cell.startsWith("-")) {
				expect(cell).toMatch(/^-\d+,\d{2} (EUR|%)$/);
			}
		}
	});

	test("reports unknown periods and periods without bills", async () => {
		await createTenant();
		const empty = await createBillPeriodRow();

		for (const id of ["missing", empty.id]) {
			await expect(periodCsv(testScope(), id)).rejects.toMatchObject({
				message: "Für diese Abrechnung konnte keine CSV erstellt werden.",
				code: "CSV_FAILED",
			});
		}
	});

	// Mahnfaktor is the fee relative to the carried-over amount it was
	// charged on (it used to divide by the drinks total: 66,67 % here).
	test("reports the Mahnfaktor relative to the carried-over amount (#138)", async () => {
		await createTenant();
		const period = await periodWithBills();

		const result = await periodCsv(testScope(), period.id, { delimiter: ";" });

		const lines = (result.csvContent ?? "").split("\n");
		const column = cells(lines[0]).indexOf("Mahnfaktor");
		const zed = lines.find((line) => line.startsWith("Zed;"));
		expect(cells(zed)[column]).toBe("10,00 %");
	});

	test("reports a Mahnfaktor of 0 % without a carried-over amount (#138)", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "Fresh" },
			drinksTotal: 3,
		});

		const result = await periodCsv(testScope(), period.id, { delimiter: ";" });

		const [header, row] = (result.csvContent ?? "").split("\n").map(cells);
		expect(row?.[header?.indexOf("Mahnfaktor") ?? -1]).toBe("0,00 %");
	});

	// With an Umlage column the money columns add up to "Zu zahlender Betrag".
	test("money columns add up to the amount due when an Umlage was charged (#138)", async () => {
		await createTenant();
		const period = await createBillPeriodRow();
		await createBillRow({
			periodId: period.id,
			user: { id: "u1", name: "Resident" },
			drinksTotal: 3,
			umlage: 5,
		});

		const result = await periodCsv(testScope(), period.id, { delimiter: ";" });

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
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		const period = await periodWithBills();

		const result = await saveBillPeriodCSV(period.id, { delimiter: ";" });

		const path = `tenants/${tenant.slug}/bills/Rechnung_21_Okt_2026.csv`;
		expect(result).toMatchObject({
			ok: true,
			data: {
				downloadUrl: `https://blob.test/${path}`,
				fileName: path,
				wasExisting: false,
			},
		});
		const [pathname, content, options] = putMock.mock.calls[0] ?? [];
		expect(pathname).toBe(path);
		expect(String(content).startsWith("Name;Helles;Pils;Wasser;")).toBe(true);
		expect(options).toEqual({
			access: "public",
			contentType: "text/csv;charset=utf-8",
			addRandomSuffix: true,
		});
		const [row] = await tenantDb().select().from(billCSVs);
		expect(row).toMatchObject({
			id: result.ok && result.data.csvId,
			billPeriodId: period.id,
			blobUrl: `https://blob.test/${path}`,
			delimiter: ";",
			fileSize: Buffer.byteLength(String(content)),
		});
	});

	test("names the file after the Berlin day of the run on a UTC server (#15)", async () => {
		useServerTimeZone("UTC");
		const tenant = await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		// Sunday 1 Nov 2026, 00:30 in Berlin; still 31 Oct in UTC.
		const period = await periodWithBills(new Date("2026-10-31T23:30:00Z"));

		const result = await saveBillPeriodCSV(period.id);

		expect(result.ok && result.data.fileName).toBe(
			`tenants/${tenant.slug}/bills/Rechnung_01_Nov_2026.csv`,
		);
	});

	test("returns the stored CSV while its blob exists and regenerates once it is gone", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		const period = await periodWithBills();
		const first = await saveBillPeriodCSV(period.id);

		const cached = await saveBillPeriodCSV(period.id);
		expect(cached).toMatchObject({
			ok: true,
			data: { wasExisting: true, csvId: first.ok && first.data.csvId },
		});
		expect(putMock).toHaveBeenCalledTimes(1);

		headMock.mockRejectedValueOnce(new Error("BlobNotFoundError"));
		const regenerated = await saveBillPeriodCSV(period.id);

		expect(regenerated).toMatchObject({
			ok: true,
			data: { wasExisting: false },
		});
		expect(putMock).toHaveBeenCalledTimes(2);
		const rows = await tenantDb().select().from(billCSVs);
		expect(rows.map((r) => r.id)).toEqual([
			regenerated.ok && regenerated.data.csvId,
		]);
	});

	test("uploads nothing when the period has no bills", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		const period = await createBillPeriodRow();

		const result = await saveBillPeriodCSV(period.id);

		expect(result).toEqual({
			ok: false,
			error: "Für diese Abrechnung konnte keine CSV erstellt werden.",
			code: "CSV_FAILED",
		});
		expect(putMock).not.toHaveBeenCalled();
		expect(await tenantDb().select().from(billCSVs)).toHaveLength(0);
	});

	// The record says ";" and the content must use it too, also without
	// options (the Kasse UI calls it that way; createCSV defaults to ",").
	test("writes the CSV with the delimiter it records (#138)", async () => {
		await createTenant();
		signInAs(await createUser({ roles: ["Getränkewart"] }));
		const period = await periodWithBills();

		await saveBillPeriodCSV(period.id);

		const [row] = await tenantDb().select().from(billCSVs);
		const content = String(putMock.mock.calls[0]?.[1]);
		expect(row?.delimiter).toBe(";");
		expect(content.startsWith("Name;")).toBe(true);
	});
});
