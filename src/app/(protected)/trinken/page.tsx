import { OpenBillCard } from "~/components/profile/OpenBillCard";
import { DrinksMenu } from "~/components/trinken/drinks/DrinksMenu";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { auth } from "~/server/auth";
import { loadOpenBill } from "~/server/loaders/open-bill";
import { loadRecentDrinkIds } from "~/server/loaders/recent-drinks";
import { getBookingAccounts } from "~/server/modules/booking-accounts/actions";
import {
	getAllDrinksForMenu,
	getDrinkMarkupPercent,
} from "~/server/modules/drinks/actions";

// Loaded on the server so the menu is in the first HTML: no client fetch,
// no spinner replacing the header (#74). loading.tsx covers navigation.
export default async function Page() {
	const session = await auth();
	const [drinks, markupPercent, bookingAccounts, recentDrinkIds, openBill] =
		await Promise.all([
			getAllDrinksForMenu(),
			getDrinkMarkupPercent(),
			getBookingAccounts(),
			session?.user?.id ? loadRecentDrinkIds(session).catch(() => []) : [],
			// An unpaid bill is shown above the menu with its Bezahlen button (#80).
			session
				? loadOpenBill(session).catch((error) => {
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
				bookingAccounts={bookingAccounts}
			/>
		</>
	);
}
