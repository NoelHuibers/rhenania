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

// Each tab loads its own data inside its own Suspense boundary, so the header
// and tab bar render at once and one slow tab does not hold back the others.

async function InventurTabData() {
	const [stockData, activeEvent, inventurEvents, etaplansWithKp, profit] =
		await Promise.all([
			getStockData(),
			getActiveEventInventory(),
			listInventurEvents(),
			listEtaplansWithKostenpunkte(),
			getInventoryProfit(),
		]);
	return (
		<DashboardTab
			stockItems={stockData}
			activeEvent={activeEvent}
			events={inventurEvents}
			etaplans={etaplansWithKp}
			profit={profit}
		/>
	);
}

async function VerlaufTabData() {
	return <HistoryTab history={await getInventoryHistory()} />;
}

async function KasseTabData() {
	const [
		kasseSummary,
		bankEntriesData,
		externalBillsData,
		entityBills,
		memberBills,
		pfandWert,
		getraenkeSettings,
	] = await Promise.all([
		getKasseSummary(),
		getBankEntries(),
		getExternalBills(),
		getOpenEntityBills(),
		getOpenMemberBills(),
		getPfandWert(),
		getGetraenkeSettings(),
	]);
	return (
		<KasseTab
			summary={kasseSummary}
			bankEntries={bankEntriesData}
			externalBills={externalBillsData}
			entityBills={entityBills}
			memberBills={memberBills}
			pfandWert={pfandWert}
			settings={getraenkeSettings}
		/>
	);
}

function Loading() {
	return <div className="p-6">Laden...</div>;
}

export default function Page() {
	return (
		<SidebarLayout>
			<Suspense fallback={<Loading />}>
				<GetraenkewartPage
					getraenkeTab={<GetraenkePage />}
					inventurTab={
						<Suspense fallback={<Loading />}>
							<InventurTabData />
						</Suspense>
					}
					verlaufTab={
						<Suspense fallback={<Loading />}>
							<VerlaufTabData />
						</Suspense>
					}
					kasseTab={
						<Suspense fallback={<Loading />}>
							<KasseTabData />
						</Suspense>
					}
					buchungTab={<BookingTab />}
				/>
			</Suspense>
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Getränkewart",
};
