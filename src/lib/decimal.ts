// Parses decimal user input accepting both German ("12,50", "1.234,56")
// and English ("12.50", "1,234.56") notation. Returns NaN when invalid,
// so it can be used as a drop-in replacement for Number.parseFloat.
export function parseDecimalInput(value: string): number {
	const s = value.trim().replace(/[€\s]/g, "");
	if (!s) return Number.NaN;

	const lastComma = s.lastIndexOf(",");
	const lastDot = s.lastIndexOf(".");

	let normalized: string;
	if (lastComma !== -1 && lastDot !== -1) {
		// Both present: the later one is the decimal separator,
		// the other one is a thousands separator.
		normalized =
			lastComma > lastDot
				? s.replace(/\./g, "").replace(",", ".")
				: s.replace(/,/g, "");
	} else if (lastComma !== -1) {
		normalized = s.replace(",", ".");
	} else {
		normalized = s;
	}

	const n = Number(normalized);
	return Number.isFinite(n) ? n : Number.NaN;
}
