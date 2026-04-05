import {
	Document,
	Image,
	Page,
	StyleSheet,
	Text,
	View,
} from "@react-pdf/renderer";
import type { PDFData, PDFEvent } from "./getPDFData";
import { RANK_MAP } from "./getPDFData";

// ─── Dimensions ───────────────────────────────────────────────────────────────
const MM = 2.8346;
const PW = 185.25 * MM; // 525.1pt — unfolded width (3 × 61.75mm)
const PH = 90 * MM; // 255.1pt — height (landscape)
const F1 = 61.75 * MM;
const F2 = 123.5 * MM;
const P1W = F1;
const P2W = F2 - F1;
const P3W = PW - F2;
const PAD = 2.5 * MM;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtTime(d: Date): string {
	const h = d.getHours();
	const m = d.getMinutes();
	if (m === 0) return `${h} h.s.t.`;
	if (m === 15) return `${h} h.c.t.`;
	if (m === 30) return `${h} h.m.c.t.`;
	return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} Uhr`;
}

function fmtDay(d: Date): string {
	return d.toLocaleDateString("de-DE", { weekday: "short" });
}

function fmtDate(d: Date): string {
	return `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.`;
}

function fmtDateRange(d: Date, end: Date | null): string {
	if (!end) return fmtDate(d);
	return `${fmtDate(d)} – ${fmtDate(end)}`;
}

function monthLabel(d: Date): string {
	return d.toLocaleDateString("de-DE", { month: "long" });
}

function formatIBAN(iban: string): string {
	return iban.replace(/(.{4})/g, "$1 ").trim();
}

function category(type: string, isPublic: boolean): 1 | 2 | 3 {
	if (!isPublic) return 1;
	if (type === "AHV") return 3;
	return 2;
}

// Superscript digit as inline small Text
function Sup({ n }: { n: 1 | 2 | 3 }) {
	return (
		<Text style={{ fontSize: 4, verticalAlign: "super" }}>{String(n)}</Text>
	);
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
	row: { flexDirection: "row", width: PW, height: PH },
	panelLeft: {
		width: P1W,
		height: PH,
		paddingHorizontal: PAD,
		paddingBottom: PAD,
		paddingTop: 0,
		flexDirection: "column",
		borderRight: "0.5pt solid #ccc",
	},
	panelMiddle: {
		width: P2W,
		height: PH,
		paddingHorizontal: PAD,
		paddingVertical: PAD,
		flexDirection: "column",
		borderRight: "0.5pt solid #ccc",
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
		<View
			style={{
				borderBottomWidth: 0.5,
				borderBottomColor: "#000",
				paddingBottom: 0.5,
				marginBottom: 1.5,
			}}
		>
			<Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7 }}>{label}</Text>
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
	const QR = 36 * MM;
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

			{/* Invitation text — italic, centered */}
			<View style={{ flex: 1, justifyContent: "center" }}>
				<Text
					style={{
						fontSize: 6,
						fontFamily: "Helvetica-Oblique",
						textAlign: "center",
						lineHeight: 1.5,
						color: "#333",
					}}
				>
					{`Zum ${semesterName} erlaubt sich der CC der Rhenania sein Semesterprogramm zu überreichen und zu allen Veranstaltungen herzlich einzuladen.`}
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

	// Fix BW-Bank typo if present in database value
	const bankName = data.ccKonto?.bankName.replace(/BWBank/g, "BW-Bank") ?? "";

	return (
		<View style={[s.panelMiddle, { justifyContent: "center" }]}>
			{/* Corps name + address */}
			<View style={{ marginBottom: 3 * MM }}>
				<Text
					style={{
						fontFamily: "Helvetica-Bold",
						fontSize: 7.5,
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
						style={{ fontSize: 6, textAlign: "center", lineHeight: 1.4 }}
					>
						{line}
					</Text>
				))}
			</View>

			{/* Leadership table — space-between gives tab-stop gap between name and rank */}
			<View
				style={{ alignSelf: "center", width: 45 * MM, marginBottom: 3 * MM }}
			>
				{cbLeaders.map((l) => (
					<View
						key={l.role}
						style={{
							flexDirection: "row",
							justifyContent: "space-between",
							marginBottom: 1.5,
						}}
					>
						<Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7 }}>
							{`CB ${l.name.split(" ").pop()}`}
						</Text>
						<Text style={{ fontSize: 7 }}>{RANK_MAP[l.role] ?? ""}</Text>
					</View>
				))}
				{fm && (
					<View
						style={{
							flexDirection: "row",
							justifyContent: "space-between",
							marginBottom: 1.5,
						}}
					>
						<Text style={{ fontFamily: "Helvetica-Bold", fontSize: 7 }}>
							{`iaCB ${fm.name.split(" ").pop()}`}
						</Text>
						<Text style={{ fontSize: 7 }}>FM</Text>
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
							style={{ fontSize: 6, textAlign: "center", lineHeight: 1.4 }}
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
			{/* Coat of arms — fills top ~70%, centered */}
			<View
				style={{
					flex: 0.7,
					alignItems: "center",
					justifyContent: "center",
				}}
			>
				<Image
					src={wappenPath}
					style={{ width: 38 * MM, height: 44 * MM, objectFit: "contain" }}
				/>
			</View>

			{/* Title block — anchored to bottom */}
			<View
				style={{
					flex: 0.3,
					alignItems: "center",
					justifyContent: "flex-end",
					paddingBottom: 2,
				}}
			>
				<Text
					style={{
						fontFamily: "Helvetica-Bold",
						fontSize: 8.5,
						textAlign: "center",
						marginBottom: 2,
					}}
				>
					Semesterprogramm
				</Text>
				<Text
					style={{
						fontFamily: "Helvetica-Bold",
						fontSize: 8.5,
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
					fontFamily: "Helvetica-Bold",
					fontSize: 6.5,
					textAlign: "center",
					marginBottom: 1.5 * MM,
					paddingTop: PAD,
				}}
			>
				{`Semesterprogramm ${data.semesterName}`}
			</Text>

			{/* Jour Fixe und Rhenanenstammtisch section */}
			<View style={{ marginBottom: 1.5 * MM }}>
				<Text
					style={{
						fontFamily: "Helvetica-Bold",
						fontSize: 6,
						marginBottom: 1.5,
					}}
				>
					Jour Fixe und Rhenanenstammtisch
				</Text>
				{data.jourFixeRule && (
					<Text style={{ fontSize: 5.5, lineHeight: 1.4, marginBottom: 1 }}>
						<Text style={{ fontFamily: "Helvetica-Bold" }}>Jour Fixe: </Text>
						{data.jourFixeRule} adH
					</Text>
				)}
				{data.stammtischRule && (
					<Text style={{ fontSize: 5.5, lineHeight: 1.4 }}>
						<Text style={{ fontFamily: "Helvetica-Bold" }}>Stammtisch: </Text>
						{data.stammtischRule}
					</Text>
				)}
			</View>

			{/* oCC section */}
			<Text
				style={{
					fontFamily: "Helvetica-Bold",
					fontSize: 6.5,
					marginBottom: 2,
				}}
			>
				oCC
			</Text>
			{anCC && <OCCRow event={anCC} label="AnCC" />}
			{/* Remaining oCC sessions start from 2 (AnCC = oCC 1) */}
			{occEvents.map((e, i) => (
				<OCCRow key={e.date.toISOString()} event={e} label={`oCC ${i + 2}`} />
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
	const DATE_W = 10 * MM;
	const DAY_W = 6 * MM;
	const TIME_W = 13 * MM;
	const cat = category(event.type, event.isPublic);

	return (
		<View
			style={{
				flexDirection: "row",
				marginBottom: 1.5,
				alignItems: "flex-start",
			}}
		>
			<Text style={{ fontSize: 6, width: DATE_W }}>{fmtDate(event.date)}</Text>
			<Text style={{ fontSize: 6, width: DAY_W, color: "#555" }}>
				{fmtDay(event.date)}
			</Text>
			<Text style={{ fontSize: 6, width: TIME_W }}>{fmtTime(event.date)}</Text>
			<Text style={{ fontSize: 6, flex: 1 }}>
				{label}
				<Sup n={cat} />
			</Text>
		</View>
	);
}

// ─── PAGE 2 — MIDDLE PANEL: First months (April–Juni) ────────────────────────

function P2Middle({ data }: { data: PDFData }) {
	const DATE_W = 18 * MM; // wide enough for "13.05. – 17.05."
	const TIME_W = 14 * MM;

	const active = data.events.filter((e) => !e.isCancelled);
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
	const DATE_W = 18 * MM;
	const TIME_W = 14 * MM;

	const active = data.events.filter((e) => !e.isCancelled);
	const entries = Array.from(groupByMonth(active).entries()).slice(3);
	const catsUsed = new Set(active.map((e) => category(e.type, e.isPublic)));

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
					borderTopWidth: 0.5,
					borderTopColor: "#bbb",
					paddingTop: 2,
				}}
			>
				{catsUsed.has(1) && (
					<Text style={{ fontSize: 5.5, color: "#555", lineHeight: 1.4 }}>
						<Text style={{ fontSize: 4, verticalAlign: "super" }}>1</Text>
						{" interne Veranstaltung"}
					</Text>
				)}
				{catsUsed.has(2) && (
					<Text style={{ fontSize: 5.5, color: "#555", lineHeight: 1.4 }}>
						<Text style={{ fontSize: 4, verticalAlign: "super" }}>2</Text>
						{" CC lädt ein"}
					</Text>
				)}
				{catsUsed.has(3) && (
					<Text style={{ fontSize: 5.5, color: "#555", lineHeight: 1.4 }}>
						<Text style={{ fontSize: 4, verticalAlign: "super" }}>3</Text>
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
			<Text style={{ fontSize: 6, width: dateW, color: "#333" }}>
				{fmtDateRange(event.date, event.endDate)}
			</Text>
			{/* No time shown for multi-day events */}
			<Text style={{ fontSize: 6, width: timeW, color: "#333" }}>
				{isMultiDay ? "" : fmtTime(event.date)}
			</Text>
			<Text style={{ fontSize: 6, flex: 1 }}>
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
			<Page size={[PW, PH]}>
				<View style={s.row}>
					<P1Left qrDataUrl={qrDataUrl} semesterName={data.semesterName} />
					<P1Middle data={data} />
					<P1Right data={data} wappenPath={wappenPath} />
				</View>
			</Page>

			{/* Page 2 — Inside */}
			<Page size={[PW, PH]}>
				<View style={s.row}>
					<P2Left data={data} />
					<P2Middle data={data} />
					<P2Right data={data} />
				</View>
			</Page>
		</Document>
	);
}
