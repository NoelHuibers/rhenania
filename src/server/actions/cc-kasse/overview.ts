"use server";

import { eq, sql } from "drizzle-orm";
import { db } from "~/server/db";
import { kostenerstattungen, kostenpunkte } from "~/server/db/schema";
import { EDIT_ROLES, requireRoles } from "./_guards";

export type BudgetStatus = "on-track" | "warning" | "over-budget";

export type KostenpunktOverview = {
	id: string;
	name: string;
	category: string;
	categoryOrder: number;
	eventId: string | null;
	budget: number;
	income: number;
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
		ausgegeben: number;
		genehmigt: number;
		verbleibend: number;
		auslastung: number;
		status: BudgetStatus;
	};
	geplanteEinnahmen: number;
	geplanterZuschuss: number;
};

function round2(n: number) {
	return Math.round(n * 100) / 100;
}

function ratioPct(ausgegeben: number, budget: number): number {
	if (budget <= 0) return ausgegeben > 0 ? 100 : 0;
	return round2((ausgegeben / budget) * 100);
}

function statusFor(ausgegeben: number, budget: number): BudgetStatus {
	if (budget <= 0) return ausgegeben > 0 ? "over-budget" : "on-track";
	const ratio = ausgegeben / budget;
	if (ratio > 1.0001) return "over-budget";
	if (ratio >= 0.8) return "warning";
	return "on-track";
}

export async function getEtaplanOverview(
	etaplanId: string,
): Promise<EtaplanOverview | null> {
	const guard = await requireRoles(EDIT_ROLES);
	if (!guard.ok) return null;

	try {
		const kps = await db
			.select({
				id: kostenpunkte.id,
				name: kostenpunkte.name,
				category: kostenpunkte.category,
				categoryOrder: kostenpunkte.categoryOrder,
				eventId: kostenpunkte.eventId,
				budget: kostenpunkte.budget,
				income: kostenpunkte.income,
			})
			.from(kostenpunkte)
			.where(eq(kostenpunkte.etaplanId, etaplanId))
			.orderBy(kostenpunkte.categoryOrder, kostenpunkte.displayOrder);

		const sums = await db
			.select({
				kostenpunktId: kostenerstattungen.kostenpunktId,
				status: kostenerstattungen.status,
				total: sql<number>`COALESCE(SUM(${kostenerstattungen.amount}), 0)`,
			})
			.from(kostenerstattungen)
			.where(eq(kostenerstattungen.etaplanId, etaplanId))
			.groupBy(kostenerstattungen.kostenpunktId, kostenerstattungen.status);

		const ausMap = new Map<string, number>();
		const genMap = new Map<string, number>();
		for (const s of sums) {
			const val = Number(s.total ?? 0);
			if (s.status === "Ausgezahlt") {
				ausMap.set(s.kostenpunktId, (ausMap.get(s.kostenpunktId) ?? 0) + val);
			} else if (s.status === "Genehmigt") {
				genMap.set(s.kostenpunktId, (genMap.get(s.kostenpunktId) ?? 0) + val);
			}
		}

		const kpOverviews: KostenpunktOverview[] = kps.map((kp) => {
			const ausgegeben = round2(ausMap.get(kp.id) ?? 0);
			const genehmigt = round2(genMap.get(kp.id) ?? 0);
			const budget = round2(kp.budget);
			return {
				id: kp.id,
				name: kp.name,
				category: kp.category,
				categoryOrder: kp.categoryOrder,
				eventId: kp.eventId,
				budget,
				income: round2(kp.income),
				ausgegeben,
				genehmigt,
				verbleibend: round2(budget - ausgegeben),
				auslastung: ratioPct(ausgegeben, budget),
				status: statusFor(ausgegeben, budget),
			};
		});

		// Roll up by category.
		const catMap = new Map<string, CategoryOverview>();
		for (const kp of kpOverviews) {
			const existing = catMap.get(kp.category);
			if (existing) {
				existing.budget = round2(existing.budget + kp.budget);
				existing.income = round2(existing.income + kp.income);
				existing.ausgegeben = round2(existing.ausgegeben + kp.ausgegeben);
				existing.genehmigt = round2(existing.genehmigt + kp.genehmigt);
			} else {
				catMap.set(kp.category, {
					category: kp.category,
					categoryOrder: kp.categoryOrder,
					budget: kp.budget,
					income: kp.income,
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
				verbleibend: round2(c.budget - c.ausgegeben),
				auslastung: ratioPct(c.ausgegeben, c.budget),
				status: statusFor(c.ausgegeben, c.budget),
			}))
			.sort((a, b) => a.categoryOrder - b.categoryOrder);

		const totalBudget = round2(kpOverviews.reduce((s, k) => s + k.budget, 0));
		const totalIncome = round2(kpOverviews.reduce((s, k) => s + k.income, 0));
		const totalAus = round2(kpOverviews.reduce((s, k) => s + k.ausgegeben, 0));
		const totalGen = round2(kpOverviews.reduce((s, k) => s + k.genehmigt, 0));

		return {
			kostenpunkte: kpOverviews,
			categories,
			total: {
				budget: totalBudget,
				income: totalIncome,
				ausgegeben: totalAus,
				genehmigt: totalGen,
				verbleibend: round2(totalBudget - totalAus),
				auslastung: ratioPct(totalAus, totalBudget),
				status: statusFor(totalAus, totalBudget),
			},
			geplanteEinnahmen: totalIncome,
			geplanterZuschuss: round2(totalBudget - totalIncome),
		};
	} catch (error) {
		console.error("Error building etaplan overview:", error);
		return null;
	}
}
