// cc-kasse.ts — data for the /cc-kasse page.

import "server-only";

import { listEinnahmen } from "~/server/actions/cc-kasse/einnahmen";
import {
	getActiveEtaplan,
	getEtaplanById,
	listEtaplans,
} from "~/server/actions/cc-kasse/etaplans";
import { listReimbursementQueue } from "~/server/actions/cc-kasse/kostenerstattungen";
import {
	linkableEvents,
	listKostenpunkteForEtaplan,
} from "~/server/actions/cc-kasse/kostenpunkte";
import { getEtaplanOverview } from "~/server/actions/cc-kasse/overview";
import {
	listBeitragRuns,
	listChargesForRun,
} from "~/server/actions/members/semesterbeitrag";
import { requirePageRoles } from "./page-access";

const ALLOWED_ROLES = ["CC-Kasse", "Senior", "Admin"];

export type CcKasseSearchParams = {
	etaplan?: string;
	tab?: string;
	run?: string;
};

export async function loadCcKassePage(
	searchParams: Promise<CcKasseSearchParams>,
) {
	const roleNames = await requirePageRoles(ALLOWED_ROLES);
	const isTreasury =
		roleNames.includes("CC-Kasse") || roleNames.includes("Admin");

	const sp = await searchParams;
	const etaplans = await listEtaplans();

	let selectedId = sp.etaplan;
	if (!selectedId || !etaplans.some((e) => e.id === selectedId)) {
		const active = await getActiveEtaplan();
		selectedId = active?.id ?? etaplans[0]?.id;
	}

	const [selectedEtaplan, kostenpunkte, overview, queue, events, einnahmen] =
		await Promise.all([
			selectedId ? getEtaplanById(selectedId) : Promise.resolve(null),
			selectedId ? listKostenpunkteForEtaplan(selectedId) : Promise.resolve([]),
			selectedId ? getEtaplanOverview(selectedId) : Promise.resolve(null),
			selectedId
				? listReimbursementQueue({ etaplanId: selectedId })
				: Promise.resolve([]),
			linkableEvents(),
			selectedId ? listEinnahmen(selectedId) : Promise.resolve([]),
		]);

	let beitragRuns: Awaited<ReturnType<typeof listBeitragRuns>> = [];
	let selectedBeitrag: Awaited<ReturnType<typeof listChargesForRun>> = null;
	if (isTreasury) {
		beitragRuns = await listBeitragRuns();
		const runId =
			sp.run && beitragRuns.some((r) => r.id === sp.run)
				? sp.run
				: beitragRuns[0]?.id;
		selectedBeitrag = runId ? await listChargesForRun(runId) : null;
	}

	return {
		etaplans,
		selectedEtaplan,
		kostenpunkte,
		overview,
		queue,
		einnahmen,
		events,
		isTreasury,
		beitragRuns,
		selectedBeitrag,
	};
}
