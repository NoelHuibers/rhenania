import type { BarSegment } from "~/components/ui/stacked-bar";

/** Paid, approved and submitted against the budget; red once overspent. */
export function budgetBar(
	budget: number,
	ausgegeben: number,
	genehmigt: number,
	eingereicht: number,
): { max: number; segments: BarSegment[]; tone: "primary" | "danger" } {
	return {
		max: budget,
		segments: [
			{ value: ausgegeben, swatch: "solid" },
			{ value: genehmigt, swatch: "soft" },
			{ value: eingereicht, swatch: "hatched" },
		],
		tone: ausgegeben + genehmigt > budget + 0.005 ? "danger" : "primary",
	};
}

export function remainingTone(verbleibend: number, budget: number) {
	if (verbleibend < 0) {
		return "text-destructive";
	}
	if (budget > 0 && verbleibend / budget < 0.2) {
		return "text-warning-muted-foreground";
	}
	return "text-success";
}

export function incomePct(income: number, ist: number): number {
	return income > 0 ? Math.round((ist / income) * 100) : ist > 0 ? 100 : 0;
}
