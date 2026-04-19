import { getChallengeNotificationPreferenceAction } from "~/server/actions/profile/preferences";
import { ChallengeBadgeProvider } from "../eloranking/ChallengeBadgeProvider";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./AppSidebar";

export async function SidebarLayout({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	const { enabled } = await getChallengeNotificationPreferenceAction();

	return (
		<SidebarProvider defaultOpen={false}>
			<ChallengeBadgeProvider notificationsEnabled={enabled}>
				<AppSidebar className={className} />
				<main className="flex min-h-screen flex-1 flex-col">
					<div className="h-full flex-1">{children}</div>
				</main>
			</ChallengeBadgeProvider>
		</SidebarProvider>
	);
}
