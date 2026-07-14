import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { CcKassePage } from "~/components/cc-kasse/CcKassePage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
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
import { auth } from "~/server/auth";
import { db } from "~/server/db";
import { roles, userRoles } from "~/server/db/schema";

async function getUserRoleNames(userId: string): Promise<string[]> {
	const rows = await db
		.select({ name: roles.name })
		.from(userRoles)
		.innerJoin(roles, eq(userRoles.roleId, roles.id))
		.where(eq(userRoles.userId, userId));
	return rows.map((r) => r.name);
}

const ALLOWED_ROLES = ["CC-Kasse", "Senior", "Admin"];

export default async function CcKasseRoute({
	searchParams,
}: {
	searchParams: Promise<{ etaplan?: string; tab?: string; run?: string }>;
}) {
	const session = await auth();
	if (!session?.user?.id) redirect("/auth/signin");

	const roleNames = await getUserRoleNames(session.user.id);
	if (!roleNames.some((r) => ALLOWED_ROLES.includes(r))) {
		redirect("/access-denied");
	}
	const isTreasury =
		roleNames.includes("CC-Kasse") || roleNames.includes("Admin");

	const sp = await searchParams;
	const etaplans = await listEtaplans();

	let selectedId = sp.etaplan;
	if (!selectedId || !etaplans.some((e) => e.id === selectedId)) {
		const active = await getActiveEtaplan();
		selectedId = active?.id ?? etaplans[0]?.id;
	}

	const [selectedEtaplan, kostenpunkte, overview, queue, events] =
		await Promise.all([
			selectedId ? getEtaplanById(selectedId) : Promise.resolve(null),
			selectedId ? listKostenpunkteForEtaplan(selectedId) : Promise.resolve([]),
			selectedId ? getEtaplanOverview(selectedId) : Promise.resolve(null),
			selectedId
				? listReimbursementQueue({ etaplanId: selectedId })
				: Promise.resolve([]),
			linkableEvents(),
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

	return (
		<SidebarLayout>
			<CcKassePage
				etaplans={etaplans}
				selectedEtaplan={selectedEtaplan}
				kostenpunkte={kostenpunkte}
				overview={overview}
				queue={queue}
				events={events}
				isTreasury={isTreasury}
				beitragRuns={beitragRuns}
				selectedBeitrag={selectedBeitrag}
			/>
		</SidebarLayout>
	);
}

export const metadata = {
	title: "CC-Kasse",
	description: "Etatplan, Kostenerstattungen und Budgetübersicht",
};
