import { Suspense } from "react";
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

async function GetraenkewartData() {
	const [
		kasseSummary,
		bankEntriesData,
		externalBillsData,
		entityBills,
		memberBills,
		pfandWert,
	] = await Promise.all([
		getKasseSummary(),
		getBankEntries(),
		getExternalBills(),
		getOpenEntityBills(),
		getOpenMemberBills(),
		getPfandWert(),
	]);

	return (
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
