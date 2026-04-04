import GetraenkewartPage from "~/components/getraenkewart/GetraenkewartPage";
import KasseTab from "~/components/getraenkewart/KasseTab";
import StockPage from "~/components/inventur/StockPage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import VersorgerPage from "~/components/trinken/versorger/VersorgerPage";
import {
	getBankEntries,
	getExternalBills,
	getKasseSummary,
	getOpenEntityBills,
	getOpenMemberBills,
	getPfandWert,
} from "~/server/actions/getraenkewart/kasse";

export default async function Page() {
	const [kasseSummary, bankEntriesData, externalBillsData, entityBills, memberBills, pfandWert] =
		await Promise.all([
			getKasseSummary(),
			getBankEntries(),
			getExternalBills(),
			getOpenEntityBills(),
			getOpenMemberBills(),
			getPfandWert(),
		]);

	return (
		<SidebarLayout>
			<GetraenkewartPage
				getraenkeTab={<VersorgerPage />}
				inventurTab={<StockPage />}
				kasseTab={
					<KasseTab
						summary={kasseSummary}
						bankEntries={bankEntriesData}
						externalBills={externalBillsData}
						entityBills={entityBills}
						memberBills={memberBills}
						pfandWert={pfandWert}
					/>
				}
			/>
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Getränkewart - Rhenania",
};
