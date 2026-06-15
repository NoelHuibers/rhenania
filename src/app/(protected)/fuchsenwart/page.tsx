import { redirect } from "next/navigation";
import FuchsenwartPage from "~/components/fuchsenladen/FuchsenwartPage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { hasAnyRole } from "~/server/actions/admin/userRoles";
import { auth } from "~/server/auth";

export default async function Page() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	const allowed = await hasAnyRole(session.user.id, ["Fuchs", "Admin"]);
	if (!allowed) {
		redirect("/access-denied");
	}

	return (
		<SidebarLayout>
			<FuchsenwartPage />
		</SidebarLayout>
	);
}

export const metadata = {
	title: "Fuchsenwart - Rhenania",
};
