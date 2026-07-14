import FuchsenladenMenu from "~/components/fuchsenladen/FuchsenladenMenu";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";

export default function Page() {
	return (
		<SidebarLayout>
			<FuchsenladenMenu />
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Fuchsenladen",
};
