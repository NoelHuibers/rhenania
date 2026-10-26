import { OrdersTracker } from "~/components/orders/Orderspage";
import { SiteHeader } from "~/components/trinken/SiteHeader";

export default function ProfilePage() {
	return (
		<>
			<SiteHeader title="Bestellungen" />
			<OrdersTracker />
		</>
	);
}
