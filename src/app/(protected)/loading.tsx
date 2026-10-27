import { PageSkeleton } from "~/components/ui/page-skeleton";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";
import { Skeleton } from "~/components/ui/skeleton";

// Shown at once on every navigation inside the app while the page's server
// work runs. The header keeps the sidebar toggle usable on phones.
export default function Loading() {
	return (
		<div className="flex flex-col">
			<header className="flex h-12 shrink-0 items-center gap-2 border-b pr-4 pl-2 lg:pr-6 lg:pl-3">
				<SidebarTrigger />
				<Separator
					orientation="vertical"
					className="mr-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
				/>
				<Skeleton className="h-5 w-40" />
			</header>
			<PageSkeleton label="Seite wird geladen…" />
		</div>
	);
}
