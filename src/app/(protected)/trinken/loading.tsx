import { DrinksMenuSkeleton } from "~/components/trinken/drinks/DrinksMenuSkeleton";
import { SiteHeader } from "~/components/trinken/SiteHeader";

// The header (and its menu button) stays while the menu loads (#74).
export default function Loading() {
	return (
		<>
			<SiteHeader title="Getränkekarte" />
			<DrinksMenuSkeleton />
		</>
	);
}
