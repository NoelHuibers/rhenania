import { DrinksMenu } from "~/components/trinken/drinks/DrinksMenu";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import {
	getAllDrinksForMenu,
	getDrinkMarkupPercent,
} from "~/server/actions/menu";
import { auth } from "~/server/auth";
import { getRecentDrinkIds } from "~/server/lib/recent-drinks";

// Loaded on the server so the menu is in the first HTML: no client fetch,
// no spinner replacing the header (#74). loading.tsx covers navigation.
export default async function Page() {
	const session = await auth();
	const userId = session?.user?.id;
	const [drinks, markupPercent, recentDrinkIds] = await Promise.all([
		getAllDrinksForMenu(),
		getDrinkMarkupPercent(),
		userId ? getRecentDrinkIds(userId).catch(() => []) : [],
	]);

	return (
		<>
			<SiteHeader title="Getränkekarte" />
			<DrinksMenu
				drinks={drinks}
				markupPercent={markupPercent}
				recentDrinkIds={recentDrinkIds}
			/>
		</>
	);
}
