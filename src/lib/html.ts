// html.ts — escape values interpolated into HTML (mail templates).

const ENTITIES: Record<string, string> = {
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	'"': "&quot;",
	"'": "&#39;",
};

/** Escapes text for HTML element content and quoted attribute values. */
export function escapeHtml(value: string | number | null | undefined): string {
	return String(value ?? "").replace(/[&<>"']/g, (c) => ENTITIES[c] ?? c);
}
