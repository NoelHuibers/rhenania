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
		<header className="flex h-12 shrink-0 items-center gap-2 border-b pr-4 pl-2 transition-[width,height] ease-linear lg:pr-6 lg:pl-3">
			<SidebarTrigger />
			<Separator
				orientation="vertical"
				className="mr-2 data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center"
			/>
			<h1 className="font-semibold text-lg">{title}</h1>
			{subtitle && (
				<>
					<Separator
						orientation="vertical"
						className="hidden data-[orientation=vertical]:h-4 data-[orientation=vertical]:self-center sm:block"
					/>
					<span className="hidden min-w-0 overflow-hidden text-ellipsis whitespace-nowrap pr-1.5 text-muted-foreground text-sm italic sm:inline-block">
						{subtitle}
					</span>
				</>
			)}
			<div className="ml-auto">
				<ThemeToggle />
			</div>
		</header>
	);
}
