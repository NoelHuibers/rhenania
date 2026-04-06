import { Suspense } from "react";
import GetraenkewartPage from "~/components/getraenkewart/GetraenkewartPage";
import KasseTab from "~/components/getraenkewart/KasseTab";
import DashboardTab from "~/components/inventur/DashboardTab";
import HistoryTab from "~/components/inventur/HistoryTab";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import GetraenkePage from "~/components/trinken/getraenkewart/GetraenkePage";
import {
	getBankEntries,
	getExternalBills,
	getKasseSummary,
	getOpenEntityBills,
	getOpenMemberBills,
	getPfandWert,
} from "~/server/actions/getraenkewart/kasse";
import {
	getInventoryHistory,
	getStockData,
} from "~/server/actions/inventur/inventur";

async function GetraenkewartData() {
	const [
		kasseSummary,
		bankEntriesData,
		externalBillsData,
		entityBills,
		memberBills,
		pfandWert,
		stockData,
		inventoryHistory,
	] = await Promise.all([
		getKasseSummary(),
		getBankEntries(),
		getExternalBills(),
		getOpenEntityBills(),
		getOpenMemberBills(),
		getPfandWert(),
		getStockData(),
		getInventoryHistory(),
	]);

	return (
		<GetraenkewartPage
			getraenkeTab={<GetraenkePage />}
			inventurTab={<DashboardTab stockItems={stockData} />}
			verlaufTab={<HistoryTab history={inventoryHistory} />}
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
	);
}

export default function Page() {
	return (
		<SidebarLayout>
			<Suspense fallback={<div className="p-6">Laden...</div>}>
				<GetraenkewartData />
			</Suspense>
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Getränkewart - Rhenania",
};
