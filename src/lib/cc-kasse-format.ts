// Shared EUR formatting for the CC-Kasse UI.
export function formatEur(n: number): string {
	return new Intl.NumberFormat("de-DE", {
		style: "currency",
		currency: "EUR",
	}).format(Number.isFinite(n) ? n : 0);
}
