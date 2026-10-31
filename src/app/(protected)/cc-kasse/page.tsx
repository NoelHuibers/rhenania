import { CcKassePage } from "~/components/cc-kasse/CcKassePage";
import {
	type CcKasseSearchParams,
	loadCcKassePage,
} from "~/server/loaders/cc-kasse";

export default async function CcKasseRoute({
	searchParams,
}: {
	searchParams: Promise<CcKasseSearchParams>;
}) {
	const data = await loadCcKassePage(searchParams);

	return (
		<CcKassePage
			etaplans={data.etaplans}
			selectedEtaplan={data.selectedEtaplan}
			kostenpunkte={data.kostenpunkte}
			overview={data.overview}
			queue={data.queue}
			einnahmen={data.einnahmen}
			events={data.events}
			isTreasury={data.isTreasury}
			beitragRuns={data.beitragRuns}
			selectedBeitrag={data.selectedBeitrag}
		/>
	);
}

export const metadata = {
	title: "CC-Kasse",
	description: "Etatplan, Kostenerstattungen und Budgetübersicht",
};
