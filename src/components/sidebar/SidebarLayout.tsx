import { cookies } from "next/headers";
import { isSidebarOpen, SIDEBAR_COOKIE_NAME } from "~/lib/sidebar-cookie";
import { getChallengeNotificationPreferenceAction } from "~/server/actions/profile/preferences";
import { ChallengeBadgeProvider } from "../eloranking/ChallengeBadgeProvider";
import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./AppSidebar";

/**
 * The app shell. Mounted once by the protected layout, so it survives
 * navigation (open state, nav scroll position) instead of re-mounting with
 * every page.
 */
export async function SidebarLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const [{ enabled }, cookieStore] = await Promise.all([
		getChallengeNotificationPreferenceAction(),
		cookies(),
	]);

	return (
		<SidebarProvider
			defaultOpen={isSidebarOpen(cookieStore.get(SIDEBAR_COOKIE_NAME)?.value)}
		>
			<ChallengeBadgeProvider notificationsEnabled={enabled}>
				<AppSidebar />
				<main className="flex min-h-screen min-w-0 flex-1 flex-col">
					<div className="h-full min-w-0 flex-1">{children}</div>
				</main>
			</ChallengeBadgeProvider>
		</SidebarProvider>
	);
}
