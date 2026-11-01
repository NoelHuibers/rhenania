// overview.ts — an Etatplan's budget overview.
//
// Pure: per Kostenpunkt, per category and in total, what was planned
// (budget, planned income), spent (paid and approved Erstattungen) and
// taken in (paid Semesterbeiträge and booked Einnahmen), and how much of
// the budget is used. The CC-Kasse service reads the sums.

import { roundToCent } from "~/lib/money";

export type BudgetStatus = "on-track" | "warning" | "over-budget";

export type KostenpunktOverview = {
	id: string;
	name: string;
	category: string;
	categoryOrder: number;
	eventId: string | null;
	budget: number;
	income: number;
	istEinnahmen: number;
	ausgegeben: number;
	genehmigt: number;
	verbleibend: number;
	auslastung: number;
	status: BudgetStatus;
};

export type CategoryOverview = {
	category: string;
	categoryOrder: number;
	budget: number;
	income: number;
	istEinnahmen: number;
	ausgegeben: number;
	genehmigt: number;
	verbleibend: number;
	auslastung: number;
	status: BudgetStatus;
};

export type EtaplanOverview = {
	kostenpunkte: KostenpunktOverview[];
	categories: CategoryOverview[];
	total: {
		budget: number;
		income: number;
		istEinnahmen: number;
		ausgegeben: number;
		genehmigt: number;
		verbleibend: number;
		auslastung: number;
		status: BudgetStatus;
	};
	geplanteEinnahmen: number;
	geplanterZuschuss: number;
};

function ratioPct(ausgegeben: number, budget: number): number {
	if (budget <= 0) {
		return ausgegeben > 0 ? 100 : 0;
	}
	return roundToCent((ausgegeben / budget) * 100);
}

/**
 * Compared in whole cents, so float drift (0.1 + 0.2) never flags a plan and
 * any overspend of at least one cent (negative Verbleibend) always does.
 */
function statusFor(ausgegeben: number, budget: number): BudgetStatus {
	const spentCents = Math.round(ausgegeben * 100);
	const budgetCents = Math.round(budget * 100);
	if (budgetCents <= 0) {
		return spentCents > 0 ? "over-budget" : "on-track";
	}
	if (spentCents > budgetCents) {
		return "over-budget";
	}
	// spent / budget >= 80 %, in integers.
	if (spentCents * 5 >= budgetCents * 4) {
		return "warning";
	}
	return "on-track";
}

/** What the overview is computed from, as the CC-Kasse repo reads it. */
export type OverviewSums = {
	kostenpunkte: {
		id: string;
		name: string;
		category: string;
		categoryOrder: number;
		eventId: string | null;
		budget: number;
		income: number;
	}[];
	/** Erstattung totals per Kostenpunkt and status. */
	erstattungen: { kostenpunktId: string; status: string; total: number }[];
	/** Paid Semesterbeiträge per linked Kostenpunkt. */
	beitraege: { kostenpunktId: string; total: number }[];
	/** Manually booked income (e.g. cash from an event) per Kostenpunkt. */
	einnahmen: { kostenpunktId: string; total: number }[];
};

export function buildOverview({
	kostenpunkte: kps,
	erstattungen,
	beitraege,
	einnahmen,
}: OverviewSums): EtaplanOverview {
	const ausMap = new Map<string, number>();
	const genMap = new Map<string, number>();
	for (const s of erstattungen) {
		const val = Number(s.total ?? 0);
		if (s.status === "Ausgezahlt") {
			ausMap.set(s.kostenpunktId, (ausMap.get(s.kostenpunktId) ?? 0) + val);
		} else if (s.status === "Genehmigt") {
			genMap.set(s.kostenpunktId, (genMap.get(s.kostenpunktId) ?? 0) + val);
		}
	}

	// Actual income from paid Semesterbeiträge, grouped by the linked KP.
	const incomeMap = new Map<string, number>();
	for (const s of beitraege) {
		incomeMap.set(s.kostenpunktId, Number(s.total ?? 0));
	}
	// Manually booked income (e.g. cash from an event), grouped by KP.
	for (const s of einnahmen) {
		incomeMap.set(
			s.kostenpunktId,
			(incomeMap.get(s.kostenpunktId) ?? 0) + Number(s.total ?? 0),
		);
	}

	const kpOverviews: KostenpunktOverview[] = kps.map((kp) => {
		const ausgegeben = roundToCent(ausMap.get(kp.id) ?? 0);
		const genehmigt = roundToCent(genMap.get(kp.id) ?? 0);
		const budget = roundToCent(kp.budget);
		return {
			id: kp.id,
			name: kp.name,
			category: kp.category,
			categoryOrder: kp.categoryOrder,
			eventId: kp.eventId,
			budget,
			income: roundToCent(kp.income),
			istEinnahmen: roundToCent(incomeMap.get(kp.id) ?? 0),
			ausgegeben,
			genehmigt,
			verbleibend: roundToCent(budget - ausgegeben),
			auslastung: ratioPct(ausgegeben, budget),
			status: statusFor(ausgegeben, budget),
		};
	});

	// Roll up by category.
	const catMap = new Map<string, CategoryOverview>();
	for (const kp of kpOverviews) {
		const existing = catMap.get(kp.category);
		if (existing) {
			existing.budget = roundToCent(existing.budget + kp.budget);
			existing.income = roundToCent(existing.income + kp.income);
			existing.istEinnahmen = roundToCent(
				existing.istEinnahmen + kp.istEinnahmen,
			);
			existing.ausgegeben = roundToCent(existing.ausgegeben + kp.ausgegeben);
			existing.genehmigt = roundToCent(existing.genehmigt + kp.genehmigt);
		} else {
			catMap.set(kp.category, {
				category: kp.category,
				categoryOrder: kp.categoryOrder,
				budget: kp.budget,
				income: kp.income,
				istEinnahmen: kp.istEinnahmen,
				ausgegeben: kp.ausgegeben,
				genehmigt: kp.genehmigt,
				verbleibend: 0,
				auslastung: 0,
				status: "on-track",
			});
		}
	}
	const categories = [...catMap.values()]
		.map((c) => ({
			...c,
			verbleibend: roundToCent(c.budget - c.ausgegeben),
			auslastung: ratioPct(c.ausgegeben, c.budget),
			status: statusFor(c.ausgegeben, c.budget),
		}))
		.sort((a, b) => a.categoryOrder - b.categoryOrder);

	const totalBudget = roundToCent(
		kpOverviews.reduce((s, k) => s + k.budget, 0),
	);
	const totalIncome = roundToCent(
		kpOverviews.reduce((s, k) => s + k.income, 0),
	);
	const totalIst = roundToCent(
		kpOverviews.reduce((s, k) => s + k.istEinnahmen, 0),
	);
	const totalAus = roundToCent(
		kpOverviews.reduce((s, k) => s + k.ausgegeben, 0),
	);
	const totalGen = roundToCent(
		kpOverviews.reduce((s, k) => s + k.genehmigt, 0),
	);

	return {
		kostenpunkte: kpOverviews,
		categories,
		total: {
			budget: totalBudget,
			income: totalIncome,
			istEinnahmen: totalIst,
			ausgegeben: totalAus,
			genehmigt: totalGen,
			verbleibend: roundToCent(totalBudget - totalAus),
			auslastung: ratioPct(totalAus, totalBudget),
			status: statusFor(totalAus, totalBudget),
		},
		geplanteEinnahmen: totalIncome,
		geplanterZuschuss: roundToCent(totalBudget - totalIncome),
	};
}
