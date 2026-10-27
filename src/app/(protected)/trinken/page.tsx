import { OpenBillCard } from "~/components/profile/OpenBillCard";
import { DrinksMenu } from "~/components/trinken/drinks/DrinksMenu";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import {
	getAllDrinksForMenu,
	getDrinkMarkupPercent,
} from "~/server/actions/menu";
import { auth } from "~/server/auth";
import { getOpenBill } from "~/server/lib/open-bill";
import { getRecentDrinkIds } from "~/server/lib/recent-drinks";

// Loaded on the server so the menu is in the first HTML: no client fetch,
// no spinner replacing the header (#74). loading.tsx covers navigation.
export default async function Page() {
	const session = await auth();
	const userId = session?.user?.id;
	const [drinks, markupPercent, recentDrinkIds, openBill] = await Promise.all([
		getAllDrinksForMenu(),
		getDrinkMarkupPercent(),
		userId ? getRecentDrinkIds(userId).catch(() => []) : [],
		// An unpaid bill is shown above the menu with its Bezahlen button (#80).
		userId
			? getOpenBill(userId).catch((error) => {
					console.error("Error loading the open bill:", error);
					return null;
				})
			: null,
	]);

	return (
		<>
			<SiteHeader title="Getränkekarte" />
			{openBill ? (
				<div className="container mx-auto px-4 pt-4">
					<OpenBillCard bill={openBill} variant="banner" />
				</div>
			) : null}
			<DrinksMenu
				drinks={drinks}
				markupPercent={markupPercent}
				recentDrinkIds={recentDrinkIds}
			/>
		</>
	);
}
