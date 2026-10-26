// ical.ts — shared RFC 5545 helpers for the calendar feeds.

const MAX_LINE_OCTETS = 75;

/** UTC date-time in iCalendar basic format, e.g. `20261104T190000Z`. */
export function formatICalDate(date: Date): string {
	return `${date.toISOString().replace(/[-:]/g, "").split(".")[0]}Z`;
}

/** Escapes a TEXT value (RFC 5545 §3.3.11); any line break becomes `\n`. */
export function escapeICalText(str: string): string {
	return str
		.replace(/\\/g, "\\\\")
		.replace(/;/g, "\\;")
		.replace(/,/g, "\\,")
		.replace(/\r\n|\r|\n/g, "\\n");
}

function utf8Length(codePoint: number): number {
	if (codePoint < 0x80) {
		return 1;
	}
	if (codePoint < 0x800) {
		return 2;
	}
	if (codePoint < 0x10000) {
		return 3;
	}
	return 4;
}

/**
 * Folds a content line so that no physical line exceeds 75 octets of UTF-8
 * (RFC 5545 §3.1). Continuation lines start with a single space, which counts
 * towards their 75 octets. Breaks only between code points, so multi-byte
 * characters (umlauts, emoji) are never split.
 */
export function foldLine(line: string): string {
	const lines: string[] = [];
	let current = "";
	let octets = 0;
	for (const char of line) {
		const size = utf8Length(char.codePointAt(0) ?? 0);
		if (octets + size > MAX_LINE_OCTETS) {
			lines.push(current);
			current = " ";
			octets = 1;
		}
		current += char;
		octets += size;
	}
	lines.push(current);
	return lines.join("\r\n");
}
