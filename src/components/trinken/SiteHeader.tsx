import { ThemeToggle } from "~/components/theme-toggle";
import { Separator } from "~/components/ui/separator";
import { SidebarTrigger } from "~/components/ui/sidebar";

export function SiteHeader({
	title,
	subtitle,
}: {
	title: string;
	subtitle?: string;
}) {
	return (
		<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b py-1 transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
			<div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
				<SidebarTrigger className="-ml-1" />
				<Separator
					orientation="vertical"
					className="mx-2 data-[orientation=vertical]:h-4"
				/>
				<div className="flex min-w-0 items-center gap-3">
					<h1 className="font-bold text-2xl leading-none tracking-tight">
						{title}
					</h1>
					{subtitle && (
						<>
							<Separator
								orientation="vertical"
								className="hidden data-[orientation=vertical]:h-6 sm:block"
							/>
							<span className="hidden min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-1.5 text-muted-foreground text-sm italic sm:inline-block">
								{subtitle}
							</span>
						</>
					)}
				</div>
				<div className="ml-auto">
					<ThemeToggle />
				</div>
			</div>
		</header>
	);
}
