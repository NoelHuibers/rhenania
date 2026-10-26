// status.ts — which colour family a status is shown in. One mapping per
// domain, so "Bezahlt" or "Kritisch" look the same on every page. The
// classes for each tone live in src/components/ui/status-badge.tsx.

export type StatusTone = "success" | "warning" | "info" | "danger" | "neutral";

/** A tone plus whether it is drawn as a solid fill (strong) or a tint. */
export type StatusStyle = { tone: StatusTone; strong?: boolean };

/** Member and Fuchsen bills: Bezahlt, Gestundet, Übertragen, Unbezahlt. */
export function billStatusStyle(
	status: string | null | undefined,
): StatusStyle {
	switch (status) {
		case "Bezahlt":
			return { tone: "success" };
		case "Gestundet":
			return { tone: "warning" };
		case "Übertragen":
			return { tone: "neutral" };
		default:
			return { tone: "danger" };
	}
}

/** CC-Kasse reimbursements. */
export function reimbursementStatusStyle(status: string): StatusStyle {
	switch (status) {
		case "Eingereicht":
			return { tone: "warning" };
		case "Genehmigt":
			return { tone: "info" };
		case "Ausgezahlt":
			return { tone: "success" };
		case "Abgelehnt":
			return { tone: "danger" };
		default:
			return { tone: "neutral" };
	}
}
