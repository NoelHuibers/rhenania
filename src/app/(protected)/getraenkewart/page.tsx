import { Suspense } from "react";
import { BookingTab } from "~/components/getraenkewart/BookingTab";
import { GetraenkewartPage } from "~/components/getraenkewart/GetraenkewartPage";
import { KasseTab } from "~/components/getraenkewart/KasseTab";
import { DashboardTab } from "~/components/inventur/DashboardTab";
import { HistoryTab } from "~/components/inventur/HistoryTab";
import { GetraenkePage } from "~/components/trinken/getraenkewart/GetraenkePage";
import { TableSkeleton } from "~/components/ui/page-skeleton";
import {
	getActiveEventInventory,
	getInventoryHistory,
	getInventoryProfit,
	getStockData,
	listEtaplansWithKostenpunkte,
	listInventurEvents,
} from "~/server/actions/inventur/inventur";
import {
	getBankEntries,
	getExternalBills,
	getGetraenkeBillingSettings,
	getGetraenkeSettings,
	getKasseSummary,
	getOpenEntityBills,
	getOpenMemberBills,
	getPfandWert,
} from "~/server/modules/getraenkekasse/actions";

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
		getraenkeBilling,
	] = await Promise.all([
		getKasseSummary(),
		getBankEntries(),
		getExternalBills(),
		getOpenEntityBills(),
		getOpenMemberBills(),
		getPfandWert(),
		getGetraenkeSettings(),
		getGetraenkeBillingSettings(),
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
			billing={getraenkeBilling}
		/>
	);
}

function Loading() {
	return <TableSkeleton rows={6} label="Tab wird geladen…" />;
}

export default function Page() {
	return (
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
	);
}

export const metadata = {
	title: "Getränkewart",
};
