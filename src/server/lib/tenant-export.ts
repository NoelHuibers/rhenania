// tenant-export.ts — "Alle Daten exportieren" (#69).
//
// Builds a ZIP with everything a Corps keeps in its tenant DB, so it can
// leave the platform (or just sleep well):
//
//   tabellen/<table>.csv   one CSV per table of the Drizzle tenant schema
//   dateien/<table>/…      the stored bill PDFs, bill CSVs and receipts
//   README.txt             what the files are, in German
//
// The table list comes from `~/server/db/schema`, so a new table ends up in
// the export without touching this file (the test also compares it with the
// migrated database).
//
// The archive is produced as a stream: tables are read in pages of
// `PAGE_SIZE` rows and files are fetched a few at a time, so memory stays
// flat however many orders a Corps has. fflate writes plain (non-ZIP64)
// archives, i.e. up to 4 GB and 65 535 entries, far above a Corps' data.

import { getTableColumns, getTableName, gt, is, sql } from "drizzle-orm";
import { type SQLiteColumn, SQLiteTable } from "drizzle-orm/sqlite-core";
import { Zip, ZipDeflate, ZipPassThrough } from "fflate";

import { csvRow } from "~/lib/csv";
import { getZonedParts } from "~/lib/time";
import * as schema from "~/server/db/schema";
import type { TenantDb } from "~/server/db/tenants";

const DELIMITER = ";";
const LINE_END = "\r\n";
/** Byte order mark, so Excel reads the files as UTF-8. */
const BOM = String.fromCharCode(0xfeff);
/** Rows read per query. */
const PAGE_SIZE = 500;
/** Files downloaded at the same time. */
const FILE_CONCURRENCY = 8;
/** Larger stored files are skipped and reported (uploads allow 10 MB). */
export const MAX_FILE_BYTES = 50 * 1024 * 1024;
const FILE_TIMEOUT_MS = 30_000;
/** Shown instead of a secret column's value. */
export const REDACTED = "[entfernt]";

/**
 * Credentials that would still work for whoever holds the ZIP: invitation
 * tokens (activate an account) and calendar feed tokens (read the
 * calendar). They are useless outside this app, so the export leaves them
 * out. Keyed by table name, then column name.
 */
export const REDACTED_COLUMNS: Record<string, readonly string[]> = {
	verification_token: ["token"],
	calendar_token: ["token"],
};

/** German one-liners for README.txt, keyed by table name. */
export const TABLE_DESCRIPTIONS: Record<string, string> = {
	achievement: "Definitionen der Erfolge (Achievements)",
	achievement_progress: "Fortschritt der Mitglieder bei den Erfolgen",
	bank_entry: "Kassenbuch der Getränkekasse (Ein- und Auszahlungen)",
	bill: "Getränkerechnungen je Mitglied",
	bill_csv: "Gespeicherte CSV-Dateien der Getränkeabrechnungen",
	bill_item: "Positionen der Getränkerechnungen",
	bill_pdf: "Gespeicherte PDF-Getränkerechnungen",
	bill_period: "Abrechnungsläufe der Getränkekasse",
	calendar_token: "Kalender-Abonnements der Mitglieder (ohne Zugangsschlüssel)",
	challenge: "Herausforderungen (Bierjunge u. a.)",
	einnahme: "Einnahmen der CC-Kasse",
	etaplan: "Etatpläne der CC-Kasse je Semester",
	event: "Termine des Semesterprogramms",
	event_rsvp: "Zu- und Absagen zu Terminen",
	event_type: "Terminarten",
	external_bill: "Rechnungen an die Getränkekasse (Lieferanten u. a.)",
	fuchsen_bill: "Fuchsenladen-Rechnungen je Mitglied",
	fuchsen_bill_item: "Positionen der Fuchsenladen-Rechnungen",
	fuchsen_bill_period: "Abrechnungsläufe des Fuchsenladens",
	fuchsen_billing_config: "Absender- und Zahlungsdaten des Fuchsenladens",
	fuchsen_item: "Artikel des Fuchsenladens",
	fuchsen_order: "Bestellungen im Fuchsenladen",
	game: "Gespielte Spiele mit ELO-Ständen",
	getraenke_billing_config: "Absenderdaten der Getränkerechnungen",
	homepage_image: "Bilder der Startseite (nur Verweise)",
	homepage_section: "Bereiche der Startseite",
	inventory: "Inventuren der Getränke",
	inventory_item: "Gezählte Bestände je Inventur und Getränk",
	kasse_config: "Einstellungen der Getränkekasse",
	kasse_type: "Kassenarten",
	konto: "Bankkonten des Corps",
	kostenerstattung: "Kostenerstattungen (Auslagen) der CC-Kasse",
	kostenpunkt: "Kostenpunkte der Etatpläne",
	kostenpunkt_position: "Positionen der Kostenpunkte",
	member: "Adressliste (Mitglieder)",
	member_status: "Mitgliedsstatus (Abteilungen)",
	order: "Getränkebestellungen",
	drink: "Getränke mit Preisen",
	recurring_event: "Wiederkehrende Termine (Vorlagen für das Semesterprogramm)",
	role: "Rollen und Ämter",
	semester_config: "Aktuelles Semester",
	semesterbeitrag_charge: "Semesterbeiträge je Mitglied",
	semesterbeitrag_run: "Läufe der Semesterbeiträge",
	user: "Benutzerkonten in diesem Corps (Name, E-Mail)",
	user_achievement: "Freigeschaltete Erfolge der Mitglieder",
	user_payment_info: "Bankverbindungen der Mitglieder für Erstattungen",
	user_preference: "Persönliche Einstellungen der Mitglieder",
	user_role: "Zuordnung von Rollen zu Benutzern",
	venue: "Veranstaltungsorte",
	verification_token: "Offene Einladungen (ohne Zugangsschlüssel)",
};

type Row = Record<string, unknown>;

/** A stored file the export downloads into `dateien/`. */
type FileRef = {
	table: string;
	rowId: string;
	url: string;
	name: string;
};

/**
 * Columns that point at stored files, per table. Images (drinks, homepage,
 * avatars) stay links in the CSVs; they are not records.
 */
const FILE_SOURCES: Record<string, (row: Row) => FileRef[]> = {
	bill_pdf: (row) => [fileRef("bill_pdf", row, row.blobUrl, row.fileName)],
	bill_csv: (row) => [fileRef("bill_csv", row, row.blobUrl, row.fileName)],
	kostenerstattung: (row) => {
		const refs = [
			fileRef("kostenerstattung", row, row.receiptUrl, row.receiptName),
		];
		if (Array.isArray(row.receipts)) {
			for (const receipt of row.receipts as unknown[]) {
				const r = (receipt ?? {}) as { url?: unknown; name?: unknown };
				refs.push(fileRef("kostenerstattung", row, r.url, r.name));
			}
		}
		return refs;
	},
};

function fileRef(table: string, row: Row, url: unknown, name: unknown) {
	return {
		table,
		rowId: String(row.id ?? ""),
		url: typeof url === "string" ? url.trim() : "",
		name: typeof name === "string" ? name : "",
	};
}

export type MissingFile = {
	table: string;
	rowId: string;
	url: string;
	reason: string;
};

export type TenantExportSummary = {
	tables: Array<{ name: string; rows: number }>;
	files: number;
	missingFiles: MissingFile[];
};

export type FetchFile = (url: string) => Promise<Response>;

export type TenantExportOptions = {
	/** Display name of the Corps, for README.txt. */
	tenantName: string;
	/** Export time (README, ZIP timestamps). */
	now?: Date;
	/** Downloads a stored file; defaults to `fetch` without redirects. */
	fetchFile?: FetchFile;
};

export type TenantExport = {
	/** The ZIP archive; pull it to drive the export. */
	stream: ReadableStream<Uint8Array>;
	/** Settles once the stream has been read to the end (or failed). */
	summary: Promise<TenantExportSummary>;
};

// ─── Schema ──────────────────────────────────────────────────────────────────

/** Every table of the tenant schema, sorted by name. */
export function exportTables(): SQLiteTable[] {
	return (Object.values(schema) as unknown[])
		.filter((value): value is SQLiteTable => is(value, SQLiteTable))
		.sort((a, b) => getTableName(a).localeCompare(getTableName(b)));
}

// ─── Values ──────────────────────────────────────────────────────────────────

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * ISO 8601 in Berlin wall-clock time with its UTC offset, to the second:
 * `2026-10-27T14:05:09+01:00`. Independent of the server's time zone.
 */
export function toBerlinIso(date: Date): string {
	const ms = date.getTime();
	if (Number.isNaN(ms)) {
		return "";
	}
	const p = getZonedParts(date);
	const seconds = date.getUTCSeconds();
	const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, seconds);
	const offset = Math.round((wall - Math.floor(ms / 1000) * 1000) / 60_000);
	const sign = offset < 0 ? "-" : "+";
	const abs = Math.abs(offset);
	return (
		`${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}` +
		`T${pad(p.hour)}:${pad(p.minute)}:${pad(seconds)}` +
		`${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`
	);
}

/**
 * A number as a plain decimal: point as separator, no grouping, no unit, no
 * exponent and no float noise (`0.1 + 0.2` → `0.3`, `12.5` → `12.5`).
 */
export function toPlainDecimal(value: number): string {
	if (!Number.isFinite(value)) {
		return "";
	}
	const clean = Number(value.toPrecision(15));
	const text = String(clean);
	if (!/e/i.test(text)) {
		return text;
	}
	if (Math.abs(clean) >= 1e21) {
		// Whole numbers this large have no fraction digits left.
		return BigInt(clean).toString();
	}
	return clean
		.toFixed(20)
		.replace(/(\.\d*?)0+$/, "$1")
		.replace(/\.$/, "");
}

/** One stored value as CSV text (before quoting). */
export function formatValue(value: unknown): string {
	if (value === null || value === undefined) {
		return "";
	}
	if (value instanceof Date) {
		return toBerlinIso(value);
	}
	if (typeof value === "boolean") {
		return value ? "true" : "false";
	}
	if (typeof value === "number") {
		return toPlainDecimal(value);
	}
	if (typeof value === "string") {
		return value;
	}
	// JSON columns (receipts, extra) come back parsed.
	return JSON.stringify(value);
}

const line = (values: string[]) => csvRow(values, DELIMITER) + LINE_END;

// ─── Reading ─────────────────────────────────────────────────────────────────

/** The rows of `table` in insertion (rowid) order, `PAGE_SIZE` at a time. */
async function* tablePages(db: TenantDb, table: SQLiteTable) {
	const columns = getTableColumns(table) as Record<string, SQLiteColumn>;
	const rowid = sql<number>`rowid`;
	let last = 0;
	while (true) {
		const page = (await db
			.select({ __rowid: rowid, ...columns })
			.from(table)
			.where(gt(rowid, last))
			.orderBy(rowid)
			.limit(PAGE_SIZE)) as Array<Row & { __rowid: number }>;
		if (page.length === 0) {
			return;
		}
		yield page;
		last = Number(page[page.length - 1]?.__rowid);
		if (page.length < PAGE_SIZE) {
			return;
		}
	}
}

// ─── Files ───────────────────────────────────────────────────────────────────

/**
 * Only files in Vercel Blob are downloaded. Receipt links are entered by
 * members, so any other address (an intranet host, a metadata endpoint …)
 * is reported instead of fetched by the server.
 */
export function isStoredFileUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		return (
			parsed.protocol === "https:" &&
			parsed.hostname.endsWith(".public.blob.vercel-storage.com") &&
			parsed.username === "" &&
			parsed.password === ""
		);
	} catch {
		return false;
	}
}

const defaultFetchFile: FetchFile = (url) =>
	fetch(url, {
		redirect: "error",
		signal: AbortSignal.timeout(FILE_TIMEOUT_MS),
	});

type Fetched =
	| { ok: true; ref: FileRef; bytes: Uint8Array }
	| { ok: false; ref: FileRef; reason: string };

async function readCapped(res: Response): Promise<Uint8Array | null> {
	if (!res.body) {
		return new Uint8Array(await res.arrayBuffer());
	}
	const reader = res.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	while (true) {
		const { done, value } = await reader.read();
		if (done) {
			break;
		}
		size += value.byteLength;
		if (size > MAX_FILE_BYTES) {
			await reader.cancel();
			return null;
		}
		chunks.push(value);
	}
	return Buffer.concat(chunks);
}

async function download(ref: FileRef, fetchFile: FetchFile): Promise<Fetched> {
	if (!isStoredFileUrl(ref.url)) {
		return {
			ok: false,
			ref,
			reason: "Link zeigt nicht auf den Dateispeicher der App",
		};
	}
	try {
		const res = await fetchFile(ref.url);
		if (!res.ok) {
			return { ok: false, ref, reason: `nicht gefunden (HTTP ${res.status})` };
		}
		const declared = Number(res.headers.get("content-length") ?? 0);
		if (declared > MAX_FILE_BYTES) {
			return { ok: false, ref, reason: "zu groß" };
		}
		const bytes = await readCapped(res);
		if (!bytes) {
			return { ok: false, ref, reason: "zu groß" };
		}
		return { ok: true, ref, bytes };
	} catch (error) {
		const reason =
			error instanceof Error && error.name === "TimeoutError"
				? "Zeitüberschreitung"
				: "nicht abrufbar";
		return { ok: false, ref, reason };
	}
}

/** Runs `fn` over `items`, at most `limit` at a time, yielding in order. */
async function* inOrder<T, R>(
	items: T[],
	limit: number,
	fn: (item: T) => Promise<R>,
): AsyncGenerator<R> {
	const running: Promise<R>[] = [];
	let next = 0;
	while (next < items.length || running.length > 0) {
		while (next < items.length && running.length < limit) {
			running.push(fn(items[next++] as T));
		}
		yield await (running.shift() as Promise<R>);
	}
}

/** A ZIP-safe file name: no folders, no control characters, not too long. */
export function safeFileName(name: string, fallback: string): string {
	const base = (name.split(/[\\/]/).pop() ?? "")
		// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping them is the point
		.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "_")
		.replace(/^\.+/, "")
		.trim();
	const clean = base || fallback;
	if (clean.length <= 120) {
		return clean;
	}
	const dot = clean.lastIndexOf(".");
	const ext = dot > 0 && clean.length - dot <= 10 ? clean.slice(dot) : "";
	return clean.slice(0, 120 - ext.length) + ext;
}

function fileNameFromUrl(url: string): string {
	try {
		return decodeURIComponent(new URL(url).pathname.split("/").pop() ?? "");
	} catch {
		return "";
	}
}

// ─── ZIP ─────────────────────────────────────────────────────────────────────

/** Collects what fflate emits so the generator can hand it on. */
class ZipSink {
	private chunks: Uint8Array[] = [];
	private error: Error | null = null;
	private readonly zip: Zip;

	constructor(private readonly mtime: Date) {
		this.zip = new Zip((err, chunk) => {
			if (err) {
				this.error = err;
			} else {
				this.chunks.push(chunk);
			}
		});
	}

	/** Starts an entry; push its content, then `final = true`. */
	open(path: string, compress: boolean): ZipDeflate | ZipPassThrough {
		const entry = compress
			? new ZipDeflate(path, { level: 6 })
			: new ZipPassThrough(path);
		entry.mtime = this.mtime;
		this.zip.add(entry);
		return entry;
	}

	add(path: string, data: Uint8Array, compress: boolean) {
		this.open(path, compress).push(data, true);
	}

	end() {
		this.zip.end();
	}

	drain(): Uint8Array[] {
		if (this.error) {
			throw this.error;
		}
		return this.chunks.splice(0);
	}
}

const encoder = new TextEncoder();

/** Writes `tabellen/<name>.csv` and collects the files its rows point at. */
async function* writeTable(
	db: TenantDb,
	table: SQLiteTable,
	sink: ZipSink,
	files: Map<string, FileRef>,
): AsyncGenerator<Uint8Array, number> {
	const name = getTableName(table);
	const columns = Object.entries(
		getTableColumns(table) as Record<string, SQLiteColumn>,
	);
	const redacted = new Set(REDACTED_COLUMNS[name] ?? []);
	const cell = (row: Row, key: string, column: SQLiteColumn) =>
		redacted.has(column.name) && row[key] != null
			? REDACTED
			: formatValue(row[key]);
	const findFiles = FILE_SOURCES[name] ?? (() => []);

	const entry = sink.open(`tabellen/${name}.csv`, true);
	entry.push(encoder.encode(BOM + line(columns.map(([, c]) => c.name))));
	let rows = 0;
	for await (const page of tablePages(db, table)) {
		let text = "";
		for (const row of page) {
			text += line(columns.map(([key, column]) => cell(row, key, column)));
			for (const ref of findFiles(row)) {
				if (ref.url && !files.has(ref.url)) {
					files.set(ref.url, ref);
				}
			}
		}
		rows += page.length;
		entry.push(encoder.encode(text));
		yield* sink.drain();
	}
	entry.push(new Uint8Array(0), true);
	yield* sink.drain();
	return rows;
}

/** Downloads the files into `dateien/`, reporting the ones it can't get. */
async function* writeFiles(
	files: FileRef[],
	fetchFile: FetchFile,
	sink: ZipSink,
	summary: TenantExportSummary,
): AsyncGenerator<Uint8Array> {
	const usedPaths = new Set<string>();
	for await (const result of inOrder(files, FILE_CONCURRENCY, (ref) =>
		download(ref, fetchFile),
	)) {
		const { ref } = result;
		if (!result.ok) {
			summary.missingFiles.push({
				table: ref.table,
				rowId: ref.rowId,
				url: ref.url,
				reason: result.reason,
			});
			continue;
		}
		const fileName = safeFileName(
			ref.name || fileNameFromUrl(ref.url),
			"datei",
		);
		const dir = `dateien/${ref.table}/${safeFileName(ref.rowId, "ohne-id")}`;
		let path = `${dir}_${fileName}`;
		for (let n = 2; usedPaths.has(path); n++) {
			path = `${dir}_${n}_${fileName}`;
		}
		usedPaths.add(path);
		// PDFs and images are compressed already.
		sink.add(path, result.bytes, /\.(csv|txt)$/i.test(path));
		summary.files++;
		yield* sink.drain();
	}
}

async function* generate(
	db: TenantDb,
	opts: TenantExportOptions,
	summary: TenantExportSummary,
): AsyncGenerator<Uint8Array> {
	const now = opts.now ?? new Date();
	const sink = new ZipSink(now);
	const files = new Map<string, FileRef>();

	for (const table of exportTables()) {
		const rows = yield* writeTable(db, table, sink, files);
		summary.tables.push({ name: getTableName(table), rows });
	}
	yield* writeFiles(
		[...files.values()],
		opts.fetchFile ?? defaultFetchFile,
		sink,
		summary,
	);

	sink.add(
		"README.txt",
		encoder.encode(BOM + readme(opts.tenantName, now, summary)),
		true,
	);
	sink.end();
	yield* sink.drain();
}

/**
 * Builds the export of one tenant DB. Nothing is read until the stream is
 * pulled; `summary` settles when it has been read to the end.
 */
export function buildTenantExport(
	db: TenantDb,
	opts: TenantExportOptions,
): TenantExport {
	const summary: TenantExportSummary = {
		tables: [],
		files: 0,
		missingFiles: [],
	};
	const chunks = generate(db, opts, summary);
	let resolveDone: (s: TenantExportSummary) => void = () => undefined;
	let rejectDone: (e: unknown) => void = () => undefined;
	const done = new Promise<TenantExportSummary>((resolve, reject) => {
		resolveDone = resolve;
		rejectDone = reject;
	});
	// Callers that only read the stream must not see an unhandled rejection.
	done.catch(() => undefined);

	const stream = new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done: finished } = await chunks.next();
				if (finished) {
					controller.close();
					resolveDone(summary);
				} else {
					controller.enqueue(value);
				}
			} catch (error) {
				controller.error(error);
				rejectDone(error);
			}
		},
		async cancel(reason) {
			rejectDone(reason ?? new Error("Export abgebrochen"));
			await chunks.return(undefined);
		},
	});
	return { stream, summary: done };
}

// ─── README ──────────────────────────────────────────────────────────────────

function readme(
	tenantName: string,
	now: Date,
	summary: TenantExportSummary,
): string {
	const out: string[] = [];
	const push = (...lines: string[]) => out.push(...lines);

	push(
		`Datenexport: ${tenantName}`,
		`Erstellt am ${toBerlinIso(now)}`,
		"",
		"Dieses Archiv enthält alle Daten, die euer Corps in der App gespeichert",
		"hat. Es enthält personenbezogene Daten (Adressen, Bankverbindungen,",
		"Bestellungen). Bitte sicher aufbewahren und nur an Berechtigte weitergeben.",
		"",
		"INHALT",
		"",
		"tabellen/<name>.csv",
		"  Eine Datei je Datenbanktabelle mit allen Zeilen. Die erste Zeile enthält",
		"  die Spaltennamen, wie sie in der Datenbank heißen. Spalten wie userId",
		"  oder billId verweisen auf die Spalte id einer anderen Tabelle.",
		"",
		"dateien/<tabelle>/<id>_<dateiname>",
		"  Die gespeicherten Dateien: Rechnungs-PDFs (bill_pdf), CSV-Dateien der",
		"  Abrechnungen (bill_csv) und Belege der Kostenerstattungen",
		"  (kostenerstattung). <id> ist die id der Zeile in der jeweiligen Tabelle.",
		"  Bilder (Getränke, Startseite, Profilbilder) sind nur als Link in den",
		"  Tabellen enthalten.",
		"",
		"README.txt",
		"  Diese Beschreibung.",
		"",
		"FORMAT DER CSV-DATEIEN",
		"",
		"- Zeichensatz UTF-8 mit BOM, Trennzeichen Semikolon (;), Zeilenende CRLF.",
		'- Felder mit Semikolon, Anführungszeichen oder Zeilenumbruch stehen in "…";',
		'  ein Anführungszeichen im Text ist verdoppelt ("").',
		"- Datum und Uhrzeit nach ISO 8601 in deutscher Zeit (Europe/Berlin) mit",
		"  Abstand zu UTC, z. B. 2026-10-27T14:05:00+01:00.",
		"- Beträge und andere Kommazahlen mit Dezimalpunkt, ohne Tausender-",
		"  trennzeichen und ohne Währung: 12.5 bedeutet 12,50 €.",
		"- Ja/Nein-Werte als true/false. Eine leere Zelle bedeutet: kein Wert.",
		"- Listen und Zusatzfelder (z. B. receipts, extra) als JSON.",
		"- Texte, die mit =, +, -, @ oder einem Tabulator beginnen, haben ein",
		"  vorangestelltes ', damit Excel sie nicht als Formel ausführt.",
		`- Zugangsschlüssel sind durch ${REDACTED} ersetzt: ${Object.entries(
			REDACTED_COLUMNS,
		)
			.flatMap(([table, cols]) => cols.map((c) => `${table}.${c}`))
			.join(", ")}.`,
		"",
		"In Excel: Daten > Aus Text/CSV, Dateiursprung 65001: Unicode (UTF-8),",
		"Trennzeichen Semikolon. Für Beträge unter Daten transformieren >",
		'Spalte > Typ ändern > "Mit Gebietsschema" Englisch wählen.',
		"",
		"NICHT ENTHALTEN",
		"",
		"Anmeldedaten (Passwörter, Sitzungen, verknüpfte Microsoft-/Google-Konten),",
		"plattformweite Daten (ELO-Wertung, Corps-übergreifende Herausforderungen)",
		"und die Einstellungen eures Corps auf der Plattform (Domains, Farben,",
		"Funktionen). Diese liegen nicht in eurer Corps-Datenbank.",
		"",
		"TABELLEN",
		"",
	);
	for (const { name, rows } of summary.tables) {
		const description = TABLE_DESCRIPTIONS[name] ?? "";
		push(
			`${name}.csv (${rows} ${rows === 1 ? "Zeile" : "Zeilen"})${
				description ? `: ${description}` : ""
			}`,
		);
	}
	push("", "DATEIEN", "", `${summary.files} Dateien im Ordner dateien/.`);
	if (summary.missingFiles.length === 0) {
		push("Alle gespeicherten Dateien sind enthalten.");
	} else {
		push(
			"",
			`${summary.missingFiles.length} Dateien konnten nicht übernommen werden.`,
			"Die Zeilen in den Tabellen sind trotzdem vollständig:",
			"",
		);
		for (const m of summary.missingFiles) {
			// The link was typed by a member: keep it on one line.
			const url = m.url.replace(/[\r\n\t]/g, " ");
			push(`- ${m.table} ${m.rowId}: ${m.reason}`, `  ${url}`);
		}
	}
	return `${out.join(LINE_END)}${LINE_END}`;
}
