import { redirect } from "next/navigation";
import { FuchsenwartPage } from "~/components/fuchsenladen/FuchsenwartPage";
import { auth } from "~/server/auth";
import { hasAnyRole } from "~/server/modules/users/actions";

export default async function Page() {
	const session = await auth();
	if (!session?.user?.id) {
		redirect("/auth/signin");
	}

	const allowed = await hasAnyRole(session.user.id, ["Fuchs", "Admin"]);
	if (!allowed) {
		redirect("/access-denied");
	}

	return <FuchsenwartPage />;
}

export const metadata = {
	title: "Fuchsenwart",
};
