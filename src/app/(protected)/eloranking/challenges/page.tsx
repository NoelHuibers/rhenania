import { redirect } from "next/navigation";
import { ChallengesClient } from "~/components/eloranking/ChallengesClient";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { auth } from "~/server/auth";

export default async function ChallengesPage() {
	const session = await auth();
	if (!session?.user?.id) redirect("/");

	return (
		<SidebarLayout>
			<div className="min-h-screen bg-background">
				<SiteHeader
					title="Herausforderungen"
					subtitle="Forderungen an der Tasse"
				/>
				<div className="container mx-auto max-w-3xl px-4 py-6">
					<ChallengesClient currentUserId={session.user.id} />
				</div>
			</div>
		</SidebarLayout>
	);
}
