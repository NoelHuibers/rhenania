// content-disposition.ts — build and read `Content-Disposition` headers for
// downloads whose file names may contain umlauts or typographic characters.
//
// Header values must be ASCII-safe (`new Response` throws on characters above
// U+00FF), so the name is sent twice (RFC 6266): an ASCII fallback in
// `filename` and, when that differs, the exact name UTF-8 percent-encoded in
// `filename*` (RFC 8187, formerly RFC 5987).

const TRANSLITERATIONS: Record<string, string> = {
	ä: "ae",
	ö: "oe",
	ü: "ue",
	Ä: "Ae",
	Ö: "Oe",
	Ü: "Ue",
	ß: "ss",
	"–": "-",
	"—": "-",
	"‚": "'",
	"‘": "'",
	"’": "'",
};

/** ASCII-only stand-in for `name` that is safe inside a quoted string. */
export function asciiFileName(name: string): string {
	return name
		.replace(/[äöüÄÖÜß–—‚‘’]/g, (c) => TRANSLITERATIONS[c] ?? c)
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.replace(/[^\x20-\x7e]|["\\]/gu, "_");
}

/** RFC 8187 `value-chars`: percent-encodes everything except attr-char. */
function encodeExtValue(value: string): string {
	return encodeURIComponent(value).replace(
		/['()*]/g,
		(c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
	);
}

/** `attachment` header for `fileName`, with `filename*` only when needed. */
export function attachmentDisposition(fileName: string): string {
	const fallback = asciiFileName(fileName);
	const header = `attachment; filename="${fallback}"`;
	if (fallback === fileName) {
		return header;
	}
	return `${header}; filename*=UTF-8''${encodeExtValue(fileName)}`;
}

/**
 * The file name from a `Content-Disposition` header, preferring the exact
 * UTF-8 `filename*` over the ASCII `filename`. Null if there is none.
 */
export function fileNameFromDisposition(header: string | null): string | null {
	if (!header) {
		return null;
	}
	const extended = /filename\*\s*=\s*([^;]+)/i.exec(header)?.[1]?.trim();
	if (extended) {
		const match = /^utf-8'[^']*'(.+)$/i.exec(extended);
		if (match?.[1]) {
			try {
				return decodeURIComponent(match[1]);
			} catch {
				// malformed escape sequence: fall back to the plain name
			}
		}
	}
	const quoted = /filename\s*=\s*"((?:[^"\\]|\\.)*)"/i.exec(header)?.[1];
	if (quoted !== undefined) {
		return quoted.replace(/\\(.)/g, "$1");
	}
	return /filename\s*=\s*([^;\s]+)/i.exec(header)?.[1] ?? null;
}
