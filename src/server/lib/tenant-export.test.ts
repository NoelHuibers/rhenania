import { getTableName } from "drizzle-orm";
import { strFromU8, unzipSync } from "fflate";
import { describe, expect, test, vi } from "vitest";

import {
	billCSVs,
	billPDFs,
	orders,
	verificationTokens,
} from "~/server/db/schema";
import {
	createEtaplan,
	createKostenpunkt,
	createReimbursement,
} from "../../../test/factories/cc-kasse";
import { createCalendarToken } from "../../../test/factories/events";
import { createMember } from "../../../test/factories/members";
import { createBill } from "../../../test/factories/platform";
import {
	createDrink,
	createTenant,
	createUser,
	setupTestDatabases,
	tenantDb,
} from "../../../test/harness";
import { requireTenant } from "../../../test/state";
import {
	buildTenantExport,
	exportTables,
	type FetchFile,
	formatValue,
	isStoredFileUrl,
	MAX_FILE_BYTES,
	REDACTED,
	safeFileName,
	TABLE_DESCRIPTIONS,
	toBerlinIso,
	toPlainDecimal,
} from "./tenant-export";

setupTestDatabases();

const NOW = new Date("2026-10-27T13:05:09Z");
const BLOB = "https://store1.public.blob.vercel-storage.com/tenants/corps";

/** No file downloads unless a test provides them. */
const noFiles: FetchFile = async () => new Response(null, { status: 404 });

async function readZip(stream: ReadableStream<Uint8Array>) {
	const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
	return unzipSync(bytes);
}

async function exportOf(
	opts: { fetchFile?: FetchFile; tenantId?: string } = {},
) {
	const { stream, summary } = buildTenantExport(tenantDb(opts.tenantId), {
		tenantName: "Corps Testania",
		now: NOW,
		fetchFile: opts.fetchFile ?? noFiles,
	});
	const files = await readZip(stream);
	return { files, summary: await summary };
}

function text(files: Record<string, Uint8Array>, name: string): string {
	const file = files[name];
	if (!file) {
		throw new Error(`${name} missing from the ZIP`);
	}
	return strFromU8(file);
}

/** Header + data lines of a table CSV, BOM and trailing CRLF removed. */
function csvLines(files: Record<string, Uint8Array>, table: string) {
	// strFromU8 (TextDecoder) already drops the BOM.
	return text(files, `tabellen/${table}.csv`)
		.replace(/\r\n$/, "")
		.split("\r\n");
}

/** Values of the data line containing `needle`, keyed by header. */
function rowWith(
	files: Record<string, Uint8Array>,
	table: string,
	needle: string,
): Record<string, string> {
	const [header, ...lines] = csvLines(files, table);
	const line = lines.find((l) => l.includes(needle));
	if (!header || !line) {
		throw new Error(`no ${table} row with ${needle}`);
	}
	const keys = header.split(";");
	// Test rows avoid quoted semicolons, so a plain split is enough.
	const values = line.split(";");
	return Object.fromEntries(keys.map((k, i) => [k, values[i] ?? ""]));
}

describe("tables", () => {
	test("every table of the migrated tenant DB has a CSV", async () => {
		await createTenant();
		const { rows } = await requireTenant().client.execute(
			"SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '__drizzle%'",
		);
		const dbTables = rows.map((r) => String(r.name)).sort();
		expect(dbTables.length).toBeGreaterThan(40);

		const { files, summary } = await exportOf();
		const csvTables = Object.keys(files)
			.filter((f) => f.startsWith("tabellen/"))
			.map((f) => f.slice("tabellen/".length, -".csv".length))
			.sort();
		// A table in the DB but not in the export means the schema lost it.
		expect(csvTables).toEqual(dbTables);
		expect(summary.tables.map((t) => t.name).sort()).toEqual(dbTables);
	});

	test("the table list comes from the schema and every table is described", () => {
		const names = exportTables().map(getTableName);
		expect(names).toContain("order");
		expect(names).toContain("semesterbeitrag_charge");
		expect(Object.keys(TABLE_DESCRIPTIONS).sort()).toEqual([...names].sort());
	});

	test("CSV files are UTF-8 with BOM, semicolon-separated, CRLF lines", async () => {
		await createTenant();
		await createDrink({ name: "Pils; hell", price: 1.5 });
		const { files } = await exportOf();
		const raw = files["tabellen/drink.csv"] as Uint8Array;
		expect([...raw.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
		const body = text(files, "tabellen/drink.csv");
		expect(body).toMatch(/\r\n$/);
		expect(body.replace(/\r\n/g, "")).not.toMatch(/\n/);
		const [header, line] = csvLines(files, "drink");
		expect(header).toBe(
			"id;name;price;kastengroesse;volume;picture;isCurrentlyAvailable;createdAt;updatedAt",
		);
		expect(line).toContain(';"Pils; hell";1.5;;;;true;');
	});

	test("an empty table still has its header line", async () => {
		await createTenant();
		const { files, summary } = await exportOf();
		expect(csvLines(files, "venue")).toEqual([
			"id;shortName;fullAddress;createdAt",
		]);
		expect(summary.tables.find((t) => t.name === "venue")?.rows).toBe(0);
	});
});

describe("values", () => {
	test("orders: money as plain decimals, Berlin ISO dates", async () => {
		await createTenant();
		const user = await createUser({ name: "Anton" });
		const drink = await createDrink({ name: "Spezi", price: 0.1 });
		await tenantDb()
			.insert(orders)
			.values({
				userId: user.id,
				userName: "Anton",
				drinkId: drink.id,
				drinkName: "Spezi",
				amount: 3,
				pricePerUnit: 0.1,
				total: 0.1 + 0.2,
				createdAt: new Date("2026-07-01T22:30:00Z"),
			});
		const { files } = await exportOf();
		const row = rowWith(files, "order", "Spezi");
		expect(row.total).toBe("0.3");
		expect(row.pricePerUnit).toBe("0.1");
		expect(row.amount).toBe("3");
		expect(row.costPerUnit).toBe("");
		expect(row.inBill).toBe("false");
		// Summer time: 22:30 UTC is 00:30 the next day in Berlin.
		expect(row.createdAt).toBe("2026-07-02T00:30:00+02:00");
	});

	test("bills: amounts and status", async () => {
		await createTenant();
		const user = await createUser();
		await createBill({
			userId: user.id,
			userName: "Berta",
			drinksTotal: 12.5,
			fees: 2,
			oldBillingAmount: -3.25,
			status: "Gestundet",
			createdAt: new Date("2026-01-15T11:00:00Z"),
		});
		const { files } = await exportOf();
		const row = rowWith(files, "bill", "Berta");
		expect(row).toMatchObject({
			status: "Gestundet",
			drinksTotal: "12.5",
			fees: "2",
			oldBillingAmount: "-3.25",
			total: "11.25",
			createdAt: "2026-01-15T12:00:00+01:00",
			paidAt: "",
		});
	});

	test("members: JSON, line breaks and formulas", async () => {
		await createTenant();
		await createMember({
			firstName: '=HYPERLINK("https://evil.example")',
			lastName: "Muster",
			notes: "Zeile 1\nZeile 2",
			extra: { Pfad: "/Liste", Geändert: "2024" },
			lettersOptOut: true,
		});
		await createMember({
			firstName: "@Mia",
			lastName: "-Test",
			city: "+Stadt",
		});
		const { files } = await exportOf();
		const body = text(files, "tabellen/member.csv");
		expect(body).toContain(`"'=HYPERLINK(""https://evil.example"")"`);
		expect(body).toContain('"Zeile 1\nZeile 2"');
		expect(body).toContain(`"{""Pfad"":""/Liste"",""Geändert"":""2024""}"`);
		expect(body).toContain(";'@Mia;'-Test;");
		expect(body).toContain(";'+Stadt;");
		expect(body).not.toMatch(/;[=+@-][^0-9]/);
	});

	test("reimbursements: receipts as JSON, amounts as decimals", async () => {
		await createTenant();
		const plan = await createEtaplan();
		const kp = await createKostenpunkt(plan.id);
		await createReimbursement(kp, {
			description: "Fässer",
			amount: 199.99,
			receipts: [{ url: `${BLOB}/receipts/a.pdf`, name: "a.pdf" }],
			expenseDate: new Date("2026-03-29T00:30:00Z"),
		});
		const { files } = await exportOf();
		const row = rowWith(files, "kostenerstattung", "Fässer");
		expect(row.amount).toBe("199.99");
		expect(row.receipts).toBe(
			`"[{""url"":""${BLOB}/receipts/a.pdf"",""name"":""a.pdf""}]"`,
		);
		// The night of the switch to summer time is still +01:00.
		expect(row.expenseDate).toBe("2026-03-29T01:30:00+01:00");
	});

	test("tokens that still grant access are not exported", async () => {
		await createTenant();
		const user = await createUser();
		await createCalendarToken(user, "cal-secret-123");
		await tenantDb().insert(verificationTokens).values({
			identifier: "neu@example.test",
			token: "invite-secret-456",
			expires: NOW,
		});
		const { files } = await exportOf();
		const all = Object.values(files)
			.map((f) => strFromU8(f))
			.join("\n");
		expect(all).not.toContain("cal-secret-123");
		expect(all).not.toContain("invite-secret-456");
		expect(rowWith(files, "calendar_token", user.id).token).toBe(REDACTED);
		expect(rowWith(files, "verification_token", "neu@").token).toBe(REDACTED);
	});

	test("reads big tables page by page", async () => {
		await createTenant();
		const user = await createUser();
		const drink = await createDrink({ name: "Helles" });
		const all = Array.from({ length: 1234 }, (_, i) => ({
			userId: user.id,
			userName: `Nr ${i}`,
			drinkId: drink.id,
			drinkName: "Helles",
			amount: 1,
			pricePerUnit: 1.5,
			total: 1.5,
		}));
		for (let i = 0; i < all.length; i += 200) {
			await tenantDb()
				.insert(orders)
				.values(all.slice(i, i + 200));
		}
		const { files, summary } = await exportOf();
		const lines = csvLines(files, "order").slice(1);
		expect(lines).toHaveLength(1234);
		expect(new Set(lines).size).toBe(1234);
		expect(summary.tables.find((t) => t.name === "order")?.rows).toBe(1234);
	});
});

describe("tenant isolation", () => {
	test("only the given tenant's rows are exported", async () => {
		const own = await createTenant({ slug: "own" });
		const other = await createTenant({ slug: "other" });
		await createDrink({ name: "Eigenes Bier" }, own.id);
		await createDrink({ name: "Fremdes Bier" }, other.id);
		await createMember({ lastName: "Fremdmann" }, other.id);

		const { files } = await exportOf({ tenantId: own.id });
		const all = Object.values(files)
			.map((f) => strFromU8(f))
			.join("\n");
		expect(all).toContain("Eigenes Bier");
		expect(all).not.toContain("Fremdes Bier");
		expect(all).not.toContain("Fremdmann");
	});
});

describe("stored files", () => {
	async function seedFiles() {
		const user = await createUser();
		const { bill, period } = await createBill({ userId: user.id });
		const second = await createBill({ userId: user.id });
		await tenantDb()
			.insert(billPDFs)
			.values([
				{
					billId: bill.id,
					userId: user.id,
					blobUrl: `${BLOB}/bills/Anton/Rechnung_1.pdf`,
					fileName: "Rechnung_1.pdf",
					fileSize: 4,
				},
				{
					billId: second.bill.id,
					userId: user.id,
					blobUrl: `${BLOB}/bills/Anton/weg.pdf`,
					fileName: "weg.pdf",
					fileSize: 4,
				},
			]);
		await tenantDb()
			.insert(billCSVs)
			.values({
				billPeriodId: period.id,
				blobUrl: `${BLOB}/bills/Rechnung_27_Okt_2026.csv`,
				fileName: "tenants/corps/bills/Rechnung_27_Okt_2026.csv",
			});
		const plan = await createEtaplan();
		const kp = await createKostenpunkt(plan.id);
		const erstattung = await createReimbursement(kp, {
			receiptUrl: `${BLOB}/receipts/alt.jpg`,
			receiptName: "alt.jpg",
			receipts: [
				{ url: `${BLOB}/receipts/alt.jpg`, name: "alt.jpg" },
				{ url: `${BLOB}/receipts/beleg.pdf`, name: "../../beleg.pdf" },
				{ url: `${BLOB}/receipts/beleg-2.pdf`, name: "beleg.pdf" },
				{ url: "http://169.254.169.254/latest/meta-data", name: "x" },
			],
		});
		return { bill, erstattung };
	}

	test("downloads PDFs, CSVs and receipts; reports the missing one", async () => {
		await createTenant();
		const { bill, erstattung } = await seedFiles();
		const fetchFile = vi.fn<FetchFile>(async (url) =>
			url.endsWith("weg.pdf")
				? new Response("gone", { status: 404 })
				: new Response(`inhalt von ${url.split("/").pop()}`),
		);

		const { files, summary } = await exportOf({ fetchFile });

		expect(
			text(files, `dateien/bill_pdf/${await pdfId(bill.id)}_Rechnung_1.pdf`),
		).toBe("inhalt von Rechnung_1.pdf");
		const csvFile = Object.keys(files).find((f) =>
			f.startsWith("dateien/bill_csv/"),
		);
		expect(csvFile).toMatch(
			/^dateien\/bill_csv\/[\w-]+_Rechnung_27_Okt_2026\.csv$/,
		);
		const receipts = Object.keys(files)
			.filter((f) => f.startsWith("dateien/kostenerstattung/"))
			.sort();
		expect(receipts).toEqual(
			[
				`dateien/kostenerstattung/${erstattung.id}_2_beleg.pdf`,
				`dateien/kostenerstattung/${erstattung.id}_alt.jpg`,
				`dateien/kostenerstattung/${erstattung.id}_beleg.pdf`,
			].sort(),
		);
		// The same receipt in the legacy column and the list is fetched once.
		expect(
			fetchFile.mock.calls.filter(([u]) => u.endsWith("alt.jpg")),
		).toHaveLength(1);
		// Links outside the blob store are never requested.
		expect(fetchFile.mock.calls.map(([u]) => u)).not.toContain(
			"http://169.254.169.254/latest/meta-data",
		);

		expect(summary.files).toBe(5);
		expect(summary.missingFiles).toEqual([
			expect.objectContaining({
				table: "bill_pdf",
				url: `${BLOB}/bills/Anton/weg.pdf`,
				reason: "nicht gefunden (HTTP 404)",
			}),
			expect.objectContaining({
				table: "kostenerstattung",
				rowId: erstattung.id,
				reason: "Link zeigt nicht auf den Dateispeicher der App",
			}),
		]);
		const readme = text(files, "README.txt");
		expect(readme).toContain("2 Dateien konnten nicht übernommen werden.");
		expect(readme).toContain(`${BLOB}/bills/Anton/weg.pdf`);
		expect(readme).toContain("nicht gefunden (HTTP 404)");
	});

	test("a failing download does not fail the export", async () => {
		await createTenant();
		await seedFiles();
		const timeout = new DOMException("timed out", "TimeoutError");
		const fetchFile: FetchFile = async (url) => {
			if (url.endsWith("alt.jpg")) {
				throw timeout;
			}
			if (url.endsWith("beleg.pdf")) {
				throw new TypeError("fetch failed");
			}
			if (url.endsWith(".csv")) {
				return new Response("x", {
					headers: { "content-length": String(MAX_FILE_BYTES + 1) },
				});
			}
			if (url.endsWith("beleg-2.pdf")) {
				// No length header: cut off while reading.
				const chunk = new Uint8Array(1024 * 1024);
				let sent = 0;
				return new Response(
					new ReadableStream({
						pull(c) {
							sent += chunk.byteLength;
							c.enqueue(chunk);
							if (sent > MAX_FILE_BYTES) {
								c.close();
							}
						},
					}),
				);
			}
			return new Response("ok");
		};

		const { files, summary } = await exportOf({ fetchFile });
		const reasons = Object.fromEntries(
			summary.missingFiles.map((m) => [m.url.split("/").pop(), m.reason]),
		);
		expect(reasons).toMatchObject({
			"alt.jpg": "Zeitüberschreitung",
			"beleg.pdf": "nicht abrufbar",
			"Rechnung_27_Okt_2026.csv": "zu groß",
			"beleg-2.pdf": "zu groß",
		});
		expect(summary.files).toBe(2);
		expect(files["README.txt"]).toBeDefined();
	});

	test("README lists the tables and says when nothing is missing", async () => {
		await createTenant();
		await createDrink({ name: "Weizen" });
		const { files } = await exportOf();
		const readme = text(files, "README.txt");
		expect(readme.startsWith("Datenexport: Corps Testania")).toBe(true);
		expect(readme).toContain("Erstellt am 2026-10-27T14:05:09+01:00");
		expect(readme).toContain("drink.csv (1 Zeile): Getränke mit Preisen");
		expect(readme).toContain("order.csv (0 Zeilen): Getränkebestellungen");
		expect(readme).toContain("Alle gespeicherten Dateien sind enthalten.");
		expect(readme).toContain("calendar_token.token");
	});
});

describe("stream", () => {
	test("cancelling the stream rejects the summary", async () => {
		await createTenant();
		const { stream, summary } = buildTenantExport(tenantDb(), {
			tenantName: "X",
			fetchFile: noFiles,
		});
		const reader = stream.getReader();
		await reader.read();
		await reader.cancel(new Error("abgebrochen"));
		await expect(summary).rejects.toThrow("abgebrochen");
	});

	test("a database error fails the stream and the summary", async () => {
		await createTenant();
		const db = tenantDb();
		const broken = new Proxy(db, {
			get(target, prop, receiver) {
				if (prop === "select") {
					return () => {
						throw new Error("DB weg");
					};
				}
				return Reflect.get(target, prop, receiver);
			},
		});
		const { stream, summary } = buildTenantExport(broken, {
			tenantName: "X",
		});
		await expect(new Response(stream).arrayBuffer()).rejects.toThrow("DB weg");
		await expect(summary).rejects.toThrow("DB weg");
	});
});

describe("helpers", () => {
	test.each([
		["2026-10-27T13:05:09Z", "2026-10-27T14:05:09+01:00"],
		["2026-07-01T00:00:00Z", "2026-07-01T02:00:00+02:00"],
		// Last second of summer time, then the first of winter time.
		["2026-10-25T00:59:59Z", "2026-10-25T02:59:59+02:00"],
		["2026-10-25T01:00:00Z", "2026-10-25T02:00:00+01:00"],
		["2026-12-31T23:30:00Z", "2027-01-01T00:30:00+01:00"],
	])("toBerlinIso(%s) = %s", (input, expected) => {
		expect(toBerlinIso(new Date(input))).toBe(expected);
	});

	test("an invalid date is empty", () => {
		expect(toBerlinIso(new Date(Number.NaN))).toBe("");
	});

	test.each([
		[0.1 + 0.2, "0.3"],
		[12.5, "12.5"],
		[-3, "-3"],
		[1e-7, "0.0000001"],
		[1e21, "1000000000000000000000"],
		[Number.NaN, ""],
		[Number.POSITIVE_INFINITY, ""],
	])("toPlainDecimal(%s) = %s", (input, expected) => {
		expect(toPlainDecimal(input)).toBe(expected);
	});

	test("formatValue", () => {
		expect(formatValue(null)).toBe("");
		expect(formatValue(undefined)).toBe("");
		expect(formatValue(true)).toBe("true");
		expect(formatValue("Text")).toBe("Text");
		expect(formatValue([{ a: 1 }])).toBe('[{"a":1}]');
	});

	test.each([
		["https://abc.public.blob.vercel-storage.com/tenants/x/a.pdf", true],
		["http://abc.public.blob.vercel-storage.com/a.pdf", false],
		["https://public.blob.vercel-storage.com.evil.example/a.pdf", false],
		["https://u:p@abc.public.blob.vercel-storage.com/a.pdf", false],
		["https://evil.example/a.pdf", false],
		["kein link", false],
	])("isStoredFileUrl(%s) = %s", (url, expected) => {
		expect(isStoredFileUrl(url)).toBe(expected);
	});

	test.each([
		["../../etc/passwd", "passwd"],
		["a\\b\\c.pdf", "c.pdf"],
		["bad:na*me?.pdf", "bad_na_me_.pdf"],
		["..versteckt", "versteckt"],
		["", "fallback"],
		["   ", "fallback"],
		[`${"x".repeat(200)}.pdf`, `${"x".repeat(116)}.pdf`],
		["y".repeat(200), "y".repeat(120)],
	])("safeFileName(%j)", (input, expected) => {
		expect(safeFileName(input, "fallback")).toBe(expected);
	});
});

async function pdfId(billId: string) {
	const rows = await tenantDb().select().from(billPDFs);
	return rows.find((r) => r.billId === billId)?.id;
}
