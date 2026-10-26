import { Suspense } from "react";
import { BookingTab } from "~/components/getraenkewart/BookingTab";
import { GetraenkewartPage } from "~/components/getraenkewart/GetraenkewartPage";
import { KasseTab } from "~/components/getraenkewart/KasseTab";
import { DashboardTab } from "~/components/inventur/DashboardTab";
import { HistoryTab } from "~/components/inventur/HistoryTab";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { GetraenkePage } from "~/components/trinken/getraenkewart/GetraenkePage";
import {
	getBankEntries,
	getExternalBills,
	getGetraenkeSettings,
	getKasseSummary,
	getOpenEntityBills,
	getOpenMemberBills,
	getPfandWert,
} from "~/server/actions/getraenkewart/kasse";
import {
	getActiveEventInventory,
	getInventoryHistory,
	getInventoryProfit,
	getStockData,
	listEtaplansWithKostenpunkte,
	listInventurEvents,
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
		activeEvent,
		inventurEvents,
		etaplansWithKp,
		inventoryProfit,
		getraenkeSettings,
	] = await Promise.all([
		getKasseSummary(),
		getBankEntries(),
		getExternalBills(),
		getOpenEntityBills(),
		getOpenMemberBills(),
		getPfandWert(),
		getStockData(),
		getInventoryHistory(),
		getActiveEventInventory(),
		listInventurEvents(),
		listEtaplansWithKostenpunkte(),
		getInventoryProfit(),
		getGetraenkeSettings(),
	]);

	return (
		<GetraenkewartPage
			getraenkeTab={<GetraenkePage />}
			inventurTab={
				<DashboardTab
					stockItems={stockData}
					activeEvent={activeEvent}
					events={inventurEvents}
					etaplans={etaplansWithKp}
					profit={inventoryProfit}
				/>
			}
			verlaufTab={<HistoryTab history={inventoryHistory} />}
			kasseTab={
				<KasseTab
					summary={kasseSummary}
					bankEntries={bankEntriesData}
					externalBills={externalBillsData}
					entityBills={entityBills}
					memberBills={memberBills}
					pfandWert={pfandWert}
					settings={getraenkeSettings}
				/>
			}
			buchungTab={<BookingTab />}
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
	title: "Getränkewart",
};
