"use client";

import {
	Beer,
	BottleWine,
	CalendarDays,
	Camera,
	House,
	Landmark,
	LogOut,
	ReceiptEuro,
	ReceiptText,
	Settings,
	Trophy,
	Truck,
	User as UserIcon,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useMemo } from "react";
import { useChallengeBadge } from "~/components/eloranking/ChallengeBadgeProvider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "~/components/ui/sidebar";
import { signOut } from "~/server/auth/client";

type Role = "Admin" | "Getränkewart" | string;

type NavItem = {
	title: string;
	href: string;
	icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
	roles: Role[];
};

type NavGroup = {
	label: string;
	items: NavItem[];
};

const navGroups: NavGroup[] = [
	{
		label: "Getränke",
		items: [
			{ title: "Trinken", href: "/trinken", icon: BottleWine, roles: [] },
			{
				title: "Rechnungen",
				href: "/rechnungen",
				icon: ReceiptEuro,
				roles: [],
			},
			{
				title: "Bestellungen",
				href: "/bestellungen",
				icon: ReceiptText,
				roles: [],
			},
		],
	},
	{
		label: "Allgemein",
		items: [
			{
				title: "Semesterprogramm",
				href: "/semesterprogramm",
				icon: CalendarDays,
				roles: [],
			},
			{ title: "Literboard", href: "/leaderboard", icon: Trophy, roles: [] },
			{ title: "Eloranking", href: "/eloranking", icon: Beer, roles: [] },
		],
	},
	{
		label: "Verwaltung",
		items: [
			{
				title: "Getränkewart",
				href: "/getraenkewart",
				icon: Truck,
				roles: ["Getränkewart", "Admin"],
			},
			{
				title: "Bilder",
				href: "/bilder",
				icon: Camera,
				roles: ["Admin", "Fotowart"],
			},
			{
				title: "Veranstaltungen",
				href: "/admin/semesterprogramm",
				icon: CalendarDays,
				roles: ["Admin"],
			},
			{
				title: "Konten",
				href: "/konten",
				icon: Landmark,
				roles: ["Admin", "Getränkewart", "CC-Kasse", "Aktivenkasse"],
			},
			{ title: "Admin", href: "/admin", icon: Settings, roles: ["Admin"] },
		],
	},
];

export type AppSidebarClientProps = {
	className?: string;
	userData: {
		name: string | null;
		email: string | null;
		image: string | null;
		roles: Role[];
	};
};

function initials(name?: string | null) {
	if (!name) return "U";
	return name
		.split(" ")
		.filter(Boolean)
		.map((n) => n[0]?.toUpperCase())
		.slice(0, 2)
		.join("");
}

export function AppSidebarClient({
	className,
	userData,
}: AppSidebarClientProps) {
	const userRoles = userData?.roles ?? [];
	const { badgeCount, notificationsEnabled } = useChallengeBadge();
	const showChallengeBadge = notificationsEnabled && badgeCount > 0;

	const filteredGroups = useMemo(
		() =>
			navGroups
				.map((group) => ({
					...group,
					items: group.items.filter(
						(item) =>
							item.roles.length === 0 ||
							item.roles.some((r) => userRoles.includes(r)),
					),
				}))
				.filter((group) => group.items.length > 0),
		[userRoles],
	);

	const handleSignOut = useCallback(async () => {
		try {
			await signOut();
			window.location.href = "/";
		} catch (error) {
			console.error("Sign out error:", error);
		}
	}, []);

	return (
		<Sidebar className={className} collapsible="icon">
			<SidebarHeader>
				<div className="flex items-center gap-2">
					<div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
						<House className="size-4" />
					</div>
					<div className="grid flex-1 text-left text-sm leading-tight">
						<span className="truncate font-semibold">Rhenania</span>
						<span className="truncate text-xs">Intranet</span>
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{filteredGroups.map((group) => (
					<SidebarGroup key={group.label}>
						<SidebarGroupLabel>{group.label}</SidebarGroupLabel>
						<SidebarGroupContent>
							<SidebarMenu>
								{group.items.map((item) => {
									const Icon = item.icon;
									const showBadge =
										item.href === "/eloranking" && showChallengeBadge;
									return (
										<SidebarMenuItem key={item.href}>
											<SidebarMenuButton asChild>
												<Link href={item.href}>
													<Icon />
													<span>{item.title}</span>
													{showBadge ? (
														<span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-500 px-1.5 font-medium text-white text-xs">
															{badgeCount}
														</span>
													) : null}
												</Link>
											</SidebarMenuButton>
										</SidebarMenuItem>
									);
								})}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				))}
			</SidebarContent>

			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<SidebarMenuButton
									size="lg"
									className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
								>
									<Avatar className="h-8 w-8 rounded-lg">
										<AvatarImage
											src={userData?.image || "/placeholder.svg"}
											alt={userData?.name || "User"}
										/>
										<AvatarFallback className="rounded-lg">
											{initials(userData?.name)}
										</AvatarFallback>
									</Avatar>
									<div className="grid flex-1 text-left text-sm leading-tight">
										<span className="truncate font-semibold">
											{userData?.name || "Unknown User"}
										</span>
										<span className="truncate text-xs">
											{userData?.email || ""}
										</span>
									</div>
								</SidebarMenuButton>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
								side="bottom"
								align="end"
								sideOffset={4}
							>
								<DropdownMenuItem asChild>
									<Link href="/profile">
										<UserIcon className="mr-2 h-4 w-4" />
										Profil
									</Link>
								</DropdownMenuItem>
								<DropdownMenuSeparator />
								<DropdownMenuItem onClick={handleSignOut}>
									<LogOut className="mr-2 h-4 w-4" />
									Abmelden
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
		</Sidebar>
	);
}
