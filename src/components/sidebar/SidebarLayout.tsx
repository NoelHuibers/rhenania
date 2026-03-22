import { SidebarProvider } from "../ui/sidebar";
import { AppSidebar } from "./AppSidebar";

export function SidebarLayout({
	children,
	className,
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<SidebarProvider defaultOpen={false}>
			<AppSidebar className={className} />
			<main className="flex min-h-screen flex-1 flex-col">
				<div className="h-full flex-1">{children}</div>
			</main>
		</SidebarProvider>
	);
}
