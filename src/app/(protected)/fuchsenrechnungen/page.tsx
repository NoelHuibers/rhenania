import FuchsenBillingDashboard from "~/components/fuchsenladen/FuchsenBillingDashboard";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";

export default function Page() {
	return (
		<SidebarLayout>
			<FuchsenBillingDashboard />
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Fuchsenrechnungen - Rhenania",
};
