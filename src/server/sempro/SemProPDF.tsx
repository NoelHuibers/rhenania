import {
	Document,
	Font,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import path from "node:path";
import type { PDFData, PDFEvent } from "./getPDFData";
import { RANK_MAP } from "./getPDFData";

// ─── Font Registration ───────────────────────────────────────────────────────
// Carlito is a metric-compatible open-source replacement for Calibri (OFL license).
// Place Carlito-Regular.ttf, Carlito-Bold.ttf, Carlito-Italic.ttf in public/fonts/.
const fontsDir = path.join(process.cwd(), "public", "fonts", "Carlito");

Font.register({
	family: "Carlito",
	fonts: [
		{
			src: path.join(fontsDir, "Carlito-Regular.ttf"),
			fontWeight: "normal",
			fontStyle: "normal",
		},
		{
			src: path.join(fontsDir, "Carlito-Bold.ttf"),
			fontWeight: "bold",
			fontStyle: "normal",
		},
		{
			src: path.join(fontsDir, "Carlito-Italic.ttf"),
			fontWeight: "normal",
			fontStyle: "italic",
		},
	],
});

// ─── Dimensions ───────────────────────────────────────────────────────────────
const MM = 2.8346;
const BLEED = 3 * MM; // 3mm bleed on each side (matches Scribus)
const PW = 185.25 * MM; // 525.1pt — unfolded width (3 × 61.75mm)
const PH = 90 * MM; // 255.1pt — height (landscape)
const PAGE_W = PW + 2 * BLEED; // 191.25mm — page width including bleed
const PAGE_H = PH + 2 * BLEED; // 96mm — page height including bleed
const F1 = 61.75 * MM;
const F2 = 123.5 * MM;
const P1W = F1;
const P2W = F2 - F1;
const P3W = PW - F2;
const PAD = 3 * MM; // ~8.5pt — matches Scribus frame offset

// ─── FIX: Timezone offset ────────────────────────────────────────────────────
// Events are stored in UTC but represent Europe/Berlin (CEST = UTC+2, CET = UTC+1).
// We extract hours in UTC and add the appropriate offset.
function toLocalDate(d: Date): Date {
	// Determine if the date falls in CEST (last Sunday of March to last Sunday of October)
	const year = d.getUTCFullYear();

	// Last Sunday of March
	const marchLast = new Date(Date.UTC(year, 2, 31));
	marchLast.setUTCDate(31 - marchLast.getUTCDay());
	marchLast.setUTCHours(1, 0, 0, 0); // transition at 01:00 UTC

	// Last Sunday of October
	const octLast = new Date(Date.UTC(year, 9, 31));
	octLast.setUTCDate(31 - octLast.getUTCDay());
	octLast.setUTCHours(1, 0, 0, 0); // transition at 01:00 UTC

	const isCEST =
		d.getTime() >= marchLast.getTime() && d.getTime() < octLast.getTime();
	const offsetMs = (isCEST ? 2 : 1) * 60 * 60 * 1000;

	return new Date(d.getTime() + offsetMs);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
	const local = toLocalDate(d);
	const h = local.getUTCHours();
	const m = local.getUTCMinutes();
	if (m === 0) return `${h} h.s.t.`;
	if (m === 15) return `${h} h.c.t.`;
	if (m === 30) return `${h} h.m.c.t.`;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} Uhr`;
}

function fmtDay(d: Date): string {
	const local = toLocalDate(d);
	return local.toLocaleDateString("de-DE", {
		weekday: "short",
		timeZone: "UTC",
	});
}

function fmtDate(d: Date): string {
	const local = toLocalDate(d);
	return `${String(local.getUTCDate()).padStart(2, "0")}.${String(local.getUTCMonth() + 1).padStart(2, "0")}.`;
}

function fmtDateRange(d: Date, end: Date | null): string {
	if (!end) return fmtDate(d);
	return `${fmtDate(d)} – ${fmtDate(end)}`;
}

function monthLabel(d: Date): string {
	const local = toLocalDate(d);
	return local.toLocaleDateString("de-DE", { month: "long", timeZone: "UTC" });
}

function formatIBAN(iban: string): string {
	return iban.replace(/(.{4})/g, "$1 ").trim();
}

// FIX: Normalize various Unicode hyphens to standard ASCII hyphen
function normalizeBankName(name: string): string {
	// Replace Unicode hyphens (U+2010, U+2011, U+2012, U+2013, U+2014) with ASCII hyphen
	return name.replace(/[\u2010\u2011\u2012\u2013\u2014]/g, "-");
}

function category(type: string, isPublic: boolean): 1 | 2 | 3 {
	if (!isPublic) return 1;
	if (type === "AHV") return 3;
	return 2;
}

// Superscript digit as inline small Text
function Sup({ n }: { n: 1 | 2 | 3 }) {
	return (
		<Text style={{ fontSize: 6, verticalAlign: "super" }}>{String(n)}</Text>
	);
}

// FIX: Check if an event is an oCC-type event (AnCC, AbCC, or numbered oCC)
function isOCCEvent(e: PDFEvent): boolean {
	return e.type === "oCC";
}

function groupByMonth(evts: PDFEvent[]): Map<string, PDFEvent[]> {
	const map = new Map<string, PDFEvent[]>();
	for (const e of evts) {
		const key = monthLabel(e.date);
		if (!map.has(key)) map.set(key, []);
		const bucket = map.get(key);
		if (bucket) bucket.push(e);
	}
	return map;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
	row: { flexDirection: "row", width: PW, height: PH, fontFamily: "Carlito" },
	panelLeft: {
		width: P1W,
		height: PH,
		paddingHorizontal: PAD,
		paddingBottom: PAD,
		paddingTop: PAD,
		flexDirection: "column",
	},
	panelMiddle: {
		width: P2W,
		height: PH,
		paddingHorizontal: PAD,
		paddingVertical: PAD,
		flexDirection: "column",
	},
	panelRight: {
		width: P3W,
		height: PH,
		paddingHorizontal: PAD,
		paddingVertical: PAD,
		flexDirection: "column",
	},
});

// ─── Month header component (View wrapper so borderBottom is reliable) ────────

function MonthHeader({ label }: { label: string }) {
	return (
		<View style={{ marginBottom: 1.5 }}>
			<Text style={{ fontFamily: "Carlito", fontWeight: "bold", fontSize: 10 }}>
				{label}
			</Text>
		</View>
	);
}

// ─── PAGE 1 — LEFT PANEL: QR code + invitation ────────────────────────────────

function P1Left({
	qrDataUrl,
	semesterName,
}: {
	qrDataUrl: string | null;
	semesterName: string;
}) {
	const QR = 56.5 * MM; // ~160pt — matches Scribus QR frame width
	return (
		<View style={s.panelLeft}>
			{/* QR code — top-aligned, no gap above */}
			<View style={{ alignItems: "center" }}>
				{qrDataUrl ? (
					<Image src={qrDataUrl} style={{ width: QR, height: QR }} />
				) : (
					<View style={{ width: QR, height: QR, backgroundColor: "#eee" }} />
				)}
			</View>

			{/* Invitation text — centered */}
			<View style={{ flex: 1, justifyContent: "center" }}>
				<Text
					style={{
						fontSize: 10,
						fontFamily: "Carlito",
						textAlign: "center",
						lineHeight: 1.2,
						color: "#000",
					}}
				>
					{`Zum ${semesterName} erlaubt\nsich der CC der Rhenania sein\nSemesterprogramm zu überreichen\nund zu allen Veranstaltungen herzlich\neinzuladen.`}
				</Text>
			</View>
		</View>
	);
}

// ─── PAGE 1 — MIDDLE PANEL: Corps info + leadership + bank ────────────────────

function P1Middle({ data }: { data: PDFData }) {
	const cbLeaders = data.leaders.filter((l) =>
		["Senior", "Consenior", "Subsenior"].includes(l.role),
	);
	const fm = data.leaders.find((l) => l.role === "Fuchsmajor");

	// FIX: Normalize Unicode hyphens in bank name (U+2010 → ASCII hyphen)
	const bankName = data.ccKonto ? normalizeBankName(data.ccKonto.bankName) : "";

	return (
		<View style={[s.panelMiddle, { justifyContent: "flex-start" }]}>
			{/* Corps name + address */}
			<View style={{ marginBottom: 3 * MM }}>
				<Text
					style={{
						fontFamily: "Carlito",
						fontWeight: "bold",
						fontSize: 14,
						textAlign: "center",
						marginBottom: 2,
					}}
				>
					Corps Rhenania
				</Text>
				{[
					"Relenbergstraße 8",
					"70174 Stuttgart",
					"Tel.: +49 (0) 711 29 73 08",
					"Fax: +49 (0) 711 29 53 66",
					"cc@rhenania-stuttgart.de",
				].map((line) => (
					<Text
						key={line}
						style={{ fontSize: 10, textAlign: "center", lineHeight: 1.2 }}
					>
						{line}
					</Text>
				))}
			</View>

			{/* Leadership table — fixed columns for consistent alignment */}
			<View
				style={{ alignSelf: "center", width: 45 * MM, marginBottom: 3 * MM }}
			>
				{cbLeaders.map((l) => (
					<View
						key={l.role}
						style={{
							flexDirection: "row",
							marginBottom: 1.5,
						}}
					>
						<Text
							style={{
								fontFamily: "Carlito",
								fontWeight: "bold",
								fontSize: 10,
								flex: 1,
							}}
						>
							{`CB ${l.name.split(" ").pop()}`}
						</Text>
						<View style={{ width: 10 * MM }}>
							<Text style={{ fontSize: 10, fontWeight: "bold" }}>
								{RANK_MAP[l.role] ?? ""}
							</Text>
						</View>
					</View>
				))}
				{fm && (
					<View
						style={{
							flexDirection: "row",
							marginBottom: 1.5,
						}}
					>
						<Text
							style={{
								fontFamily: "Carlito",
								fontWeight: "bold",
								fontSize: 10,
								flex: 1,
							}}
						>
							{`IaCB ${fm.name.split(" ").pop()}`}
						</Text>
						<View style={{ width: 10 * MM }}>
							<Text style={{ fontSize: 10, fontWeight: "bold" }}>FM</Text>
						</View>
					</View>
				)}
			</View>

			{/* Bank details */}
			{data.ccKonto && (
				<View>
					{[
						"CC Konto",
						`IBAN: ${formatIBAN(data.ccKonto.iban)}`,
						`BIC: ${data.ccKonto.bic}`,
						bankName,
					].map((line) => (
						<Text
							key={line}
							style={{ fontSize: 10, textAlign: "center", lineHeight: 1.2 }}
						>
							{line}
						</Text>
					))}
				</View>
			)}
		</View>
	);
}

// ─── PAGE 1 — RIGHT PANEL: Cover ─────────────────────────────────────────────

function P1Right({ data, wappenPath }: { data: PDFData; wappenPath: string }) {
	return (
		<View style={[s.panelRight, { alignItems: "center" }]}>
			{/* Coat of arms — fills top ~85%, centered */}
			<View
				style={{
					flex: 0.85,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Image
					src={wappenPath}
					style={{ width: 54 * MM, height: 72 * MM, objectFit: "contain" }}
				/>
			</View>

			{/* Title block — anchored to bottom */}
			<View
				style={{
					flex: 0.15,
					alignItems: "center",
					justifyContent: "flex-end",
					paddingBottom: 2,
				}}
			>
				<Text
					style={{
						fontFamily: "Carlito",
						fontWeight: "bold",
						fontSize: 12,
						textAlign: "center",
						marginBottom: 2,
					}}
				>
					Semesterprogramm
				</Text>
				<Text
					style={{
						fontFamily: "Carlito",
						fontWeight: "bold",
						fontSize: 12,
						textAlign: "center",
					}}
				>
					{data.semesterName}
				</Text>
			</View>
		</View>
	);
}

// ─── PAGE 2 — LEFT PANEL: Title + Jour Fixe section + oCC list ───────────────

function P2Left({ data }: { data: PDFData }) {
	const anCC = data.events.find(
		(e) => e.title.toLowerCase().includes("ancc") && !e.isCancelled,
	);
	const abCC = [...data.events]
		.reverse()
		.find((e) => e.title.toLowerCase().includes("abcc") && !e.isCancelled);

	// Exclude AnCC and AbCC — they are rendered separately as first/last entries
	const occEvents = data.events.filter(
		(e) => e.type === "oCC" && !e.isCancelled && e !== anCC && e !== abCC,
	);

	return (
		<View style={s.panelLeft}>
			{/* Title */}
			<Text
				style={{
					fontFamily: "Carlito",
					fontWeight: "bold",
					fontSize: 14,
					textAlign: "center",
					paddingTop: PAD,
				}}
			>
				Semesterprogramm
			</Text>
			<Text
				style={{
					fontFamily: "Carlito",
					fontWeight: "bold",
					fontSize: 14,
					textAlign: "center",
					marginBottom: 1.5 * MM,
				}}
			>
				{data.semesterName}
			</Text>

			{/* FIX: Jour Fixe und Rhenanenstammtisch section — hardcoded text */}
			<View style={{ marginBottom: 1.5 * MM }}>
				<Text
					style={{
						fontFamily: "Carlito",
						fontWeight: "bold",
						fontSize: 10,
						textAlign: "center",
						marginBottom: 2,
					}}
				>
					Jour Fixe und Rhenanenstammtisch
				</Text>
				<Text style={{ fontSize: 10, lineHeight: 1.2, textAlign: "center" }}>
					{
						"Der Rhenanenstammtisch findet in der Regel jeden 1. Mittwoch im Monat statt."
					}
					<Sup n={3} />
				</Text>
				<Text style={{ fontSize: 10, lineHeight: 1.2, textAlign: "center" }}>
					{"Der Jour Fix findet jeden 1. und 3. Mittwoch im Monat adH statt."}
				</Text>
			</View>

			{/* oCC section */}
			<Text
				style={{
					fontFamily: "Carlito",
					fontWeight: "bold",
					fontSize: 10,
					marginBottom: 2,
				}}
			>
				oCC
			</Text>
			{anCC && <OCCRow event={anCC} label="AnCC" />}
			{/* Remaining oCC sessions start from 2 (AnCC = oCC 1) */}
			{occEvents.map((e, i) => (
				<OCCRow key={e.date.toISOString()} event={e} label={`${i + 2}. oCC`} />
			))}
			{abCC && <OCCRow event={abCC} label="AbCC" />}
		</View>
	);
}

function OCCRow({
	event,
	label,
}: {
	event: { date: Date; title: string; type: string; isPublic: boolean };
	label: string;
}) {
	const DATE_W = 12.7 * MM; // ~36pt — matches target tab position
	const DAY_W = 7 * MM; // ~20pt — day abbreviation column
	const TIME_W = 15 * MM; // ~43pt — matches target tab position
	const cat = category(event.type, event.isPublic);

	return (
		<View
			style={{
				flexDirection: "row",
				marginBottom: 1.5,
				alignItems: "flex-start",
			}}
		>
			<Text style={{ fontSize: 10, width: DATE_W }}>{fmtDate(event.date)}</Text>
			<Text style={{ fontSize: 10, width: DAY_W }}>{fmtDay(event.date)}</Text>
			<Text style={{ fontSize: 10, width: TIME_W }}>{fmtTime(event.date)}</Text>
			<Text style={{ fontSize: 10, flex: 1 }}>
				{label}
				<Sup n={cat} />
			</Text>
		</View>
	);
}

// ─── PAGE 2 — MIDDLE PANEL: First months (April–Juni) ────────────────────────

function P2Middle({ data }: { data: PDFData }) {
	const DATE_W = 13 * MM; // single-day date column
	const TIME_W = 14.5 * MM; // time column

	// FIX: Filter out oCC events — they only appear in the left panel
	const active = data.events.filter((e) => !e.isCancelled && !isOCCEvent(e));
	const entries = Array.from(groupByMonth(active).entries()).slice(0, 3);

	return (
		<View style={s.panelMiddle}>
			{entries.map(([month, evts]) => (
				<View key={month} style={{ marginBottom: 2 * MM }}>
					<MonthHeader label={month} />
					{evts.map((e) => (
						<EventRow
							key={e.date.toISOString() + e.title}
							event={e}
							dateW={DATE_W}
							timeW={TIME_W}
						/>
					))}
				</View>
			))}
		</View>
	);
}

// ─── PAGE 2 — RIGHT PANEL: Remaining months + footnote legend ────────────────

function P2Right({ data }: { data: PDFData }) {
	const DATE_W = 13 * MM;
	const TIME_W = 14.5 * MM;

	// FIX: Filter out oCC events — they only appear in the left panel
	const active = data.events.filter((e) => !e.isCancelled && !isOCCEvent(e));
	const entries = Array.from(groupByMonth(active).entries()).slice(3);

	// Use all non-cancelled events (including oCC) for footnote legend
	const allActive = data.events.filter((e) => !e.isCancelled);
	const catsUsed = new Set(allActive.map((e) => category(e.type, e.isPublic)));

	return (
		<View style={s.panelRight}>
			{entries.map(([month, evts]) => (
				<View key={month} style={{ marginBottom: 2 * MM }}>
					<MonthHeader label={month} />
					{evts.map((e) => (
						<EventRow
							key={e.date.toISOString() + e.title}
							event={e}
							dateW={DATE_W}
							timeW={TIME_W}
						/>
					))}
				</View>
			))}

			{/* Footnote legend — pinned to bottom */}
			<View
				style={{
					marginTop: "auto",
				}}
			>
				{catsUsed.has(1) && (
					<Text style={{ fontSize: 10, lineHeight: 1.2 }}>
						<Text style={{ fontSize: 6, verticalAlign: "super" }}>1</Text>
						{" interne Veranstaltung"}
					</Text>
				)}
				{catsUsed.has(2) && (
					<Text style={{ fontSize: 10, lineHeight: 1.2 }}>
						<Text style={{ fontSize: 6, verticalAlign: "super" }}>2</Text>
						{" CC lädt ein"}
					</Text>
				)}
				{catsUsed.has(3) && (
					<Text style={{ fontSize: 10, lineHeight: 1.2 }}>
						<Text style={{ fontSize: 6, verticalAlign: "super" }}>3</Text>
						{" AHV lädt ein"}
					</Text>
				)}
			</View>
		</View>
	);
}

// ─── Event row (shared by P2Middle and P2Right) ───────────────────────────────

function EventRow({
	event,
	dateW,
	timeW,
}: {
	event: PDFEvent;
	dateW: number;
	timeW: number;
}) {
	const isMultiDay = event.endDate !== null;
	const cat = category(event.type, event.isPublic);

	return (
		<View
			style={{
				flexDirection: "row",
				marginBottom: 1,
				alignItems: "flex-start",
			}}
		>
			{isMultiDay ? (
				<>
					{/* Multi-day: date range spans date+time columns */}
					<Text style={{ fontSize: 10, width: dateW + timeW }}>
						{fmtDateRange(event.date, event.endDate)}
					</Text>
				</>
			) : (
				<>
					<Text style={{ fontSize: 10, width: dateW }}>
						{fmtDate(event.date)}
					</Text>
					<Text style={{ fontSize: 10, width: timeW }}>
						{fmtTime(event.date)}
					</Text>
				</>
			)}
			<Text style={{ fontSize: 10, flex: 1 }}>
				{event.title}
				<Sup n={cat} />
			</Text>
		</View>
	);
}

// ─── Document ─────────────────────────────────────────────────────────────────

export function SemProPDFDocument({
	data,
	wappenPath,
	qrDataUrl,
}: {
	data: PDFData;
	wappenPath: string;
	qrDataUrl: string | null;
}) {
	return (
		<Document
			title={`Semesterprogramm ${data.semesterName}`}
			author="Corps Rhenania zu Stuttgart"
		>
			{/* Page 1 — Outside cover */}
			<Page size={[PAGE_W, PAGE_H]}>
				<View style={[s.row, { marginLeft: BLEED, marginTop: BLEED }]}>
					<P1Left qrDataUrl={qrDataUrl} semesterName={data.semesterName} />
					<P1Middle data={data} />
					<P1Right data={data} wappenPath={wappenPath} />
				</View>
			</Page>

			{/* Page 2 — Inside */}
			<Page size={[PAGE_W, PAGE_H]}>
				<View style={[s.row, { marginLeft: BLEED, marginTop: BLEED }]}>
					<P2Left data={data} />
					<P2Middle data={data} />
					<P2Right data={data} />
				</View>
			</Page>
		</Document>
	);
}
