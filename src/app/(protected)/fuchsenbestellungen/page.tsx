import FuchsenOrdersPage from "~/components/fuchsenladen/FuchsenOrdersPage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";

export default function Page() {
	return (
		<SidebarLayout>
			<FuchsenOrdersPage />
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Fuchsenbestellungen",
};
