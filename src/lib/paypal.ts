// Shared PayPal link normalizer used by the bill/beitrag PDFs and emails.
// Accepts a full URL (https://paypal.me/foo), a paypal.me path, a bare handle,
// or an @handle and returns a canonical paypal.me URL WITHOUT a trailing slash.
// Callers that append an amount build `${normalizePaypalLink(x)}/${amount}`.
export function normalizePaypalLink(raw: string): string {
	const trimmed = raw.trim();
	const base = /^https?:\/\//i.test(trimmed)
		? trimmed
		: `https://paypal.me/${trimmed
				.replace(/^(www\.)?paypal\.me\//i, "")
				.replace(/^@/, "")}`;
	return base.replace(/\/+$/, "");
}
