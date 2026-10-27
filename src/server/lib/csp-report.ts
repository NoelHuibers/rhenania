// csp-report.ts — normalises Content-Security-Policy violation reports (#91).
//
// Browsers send two formats to the endpoints named in the CSP:
// - `report-uri` (Firefox, older browsers): `application/csp-report`,
//   `{ "csp-report": { "document-uri", "effective-directive", … } }`
// - `report-to` / Reporting API (Chromium, Safari): `application/reports+json`,
//   `[{ "type": "csp-violation", "body": { documentURL, effectiveDirective, … } }]`
// Both become the same few log fields. Script samples are dropped: they can
// contain page content.

export type CspViolation = {
	directive: string | null;
	blocked: string | null;
	document: string | null;
	source: string | null;
	line: number | null;
	disposition: string | null;
};

/** Reports logged per request, at most. */
const MAX_REPORTS = 20;
const MAX_FIELD = 300;

type Fields = Record<string, unknown>;

function text(value: unknown): string | null {
	return typeof value === "string" && value !== ""
		? value.slice(0, MAX_FIELD)
		: null;
}

function lineNumber(value: unknown): number | null {
	return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function isObject(value: unknown): value is Fields {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function fromLegacy(r: Fields): CspViolation {
	return {
		directive: text(r["effective-directive"] ?? r["violated-directive"]),
		blocked: text(r["blocked-uri"]),
		document: text(r["document-uri"]),
		source: text(r["source-file"]),
		line: lineNumber(r["line-number"]),
		disposition: text(r.disposition),
	};
}

function fromReportingApi(b: Fields): CspViolation {
	return {
		directive: text(b.effectiveDirective),
		blocked: text(b.blockedURL),
		document: text(b.documentURL),
		source: text(b.sourceFile),
		line: lineNumber(b.lineNumber),
		disposition: text(b.disposition),
	};
}

/** The CSP violations in a report body; anything else yields none. */
export function parseCspReports(raw: string): CspViolation[] {
	let data: unknown;
	try {
		data = JSON.parse(raw);
	} catch {
		return [];
	}
	if (isObject(data) && isObject(data["csp-report"])) {
		return [fromLegacy(data["csp-report"])];
	}
	if (!Array.isArray(data)) {
		return [];
	}
	return data
		.filter(
			(r): r is { type: string; body: Fields } =>
				isObject(r) && r.type === "csp-violation" && isObject(r.body),
		)
		.slice(0, MAX_REPORTS)
		.map((r) => fromReportingApi(r.body));
}
