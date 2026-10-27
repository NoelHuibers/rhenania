"use client";

import { ChevronDown, House } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useChallengeBadge } from "~/components/eloranking/ChallengeBadgeProvider";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
	Sidebar,
	SidebarContent,
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "~/components/ui/sidebar";
import { signOut } from "~/server/auth/client";
import { navGroups, type Role } from "./nav-config";
import { SidebarUserMenu } from "./SidebarUserMenu";

export type AppSidebarClientProps = {
	className?: string;
	tenantName: string;
	userData: {
		name: string | null;
		email: string | null;
		image: string | null;
		roles: Role[];
	};
};

const COLLAPSED_GROUPS_KEY = "sidebar-collapsed-groups";

export function AppSidebarClient({
	className,
	userData,
	tenantName,
}: AppSidebarClientProps) {
	const userRoles = userData?.roles ?? [];
	const { badgeCount, notificationsEnabled } = useChallengeBadge();
	const showChallengeBadge = notificationsEnabled && badgeCount > 0;

	const [collapsedGroups, setCollapsedGroups] = useState<string[]>([]);

	// The sidebar stays mounted across pages now, so the mobile sheet has to
	// close itself when a link is followed.
	const pathname = usePathname() ?? "";
	const { isMobile, setOpenMobile } = useSidebar();
	const closeMobile = useCallback(() => {
		if (isMobile) {
			setOpenMobile(false);
		}
	}, [isMobile, setOpenMobile]);

	useEffect(() => {
		try {
			const stored = window.localStorage.getItem(COLLAPSED_GROUPS_KEY);
			if (stored) {
				setCollapsedGroups(JSON.parse(stored));
			}
		} catch {
			// ignore invalid stored state
		}
	}, []);

	const toggleGroup = useCallback((label: string) => {
		setCollapsedGroups((prev) => {
			const next = prev.includes(label)
				? prev.filter((l) => l !== label)
				: [...prev, label];
			try {
				window.localStorage.setItem(COLLAPSED_GROUPS_KEY, JSON.stringify(next));
			} catch {
				// ignore storage errors
			}
			return next;
		});
	}, []);

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

	// The most specific nav entry for the current page (/admin/semesterprogramm
	// wins over /admin).
	const activeHref = useMemo(
		() =>
			filteredGroups
				.flatMap((g) => g.items.map((i) => i.href))
				.filter((href) => pathname === href || pathname.startsWith(`${href}/`))
				.sort((a, b) => b.length - a.length)[0],
		[filteredGroups, pathname],
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
						<span className="truncate font-semibold">{tenantName}</span>
						<span className="truncate text-xs">Intranet</span>
					</div>
				</div>
			</SidebarHeader>

			<SidebarContent>
				{filteredGroups.map((group) => (
					<Collapsible
						key={group.label}
						open={!collapsedGroups.includes(group.label)}
						onOpenChange={() => toggleGroup(group.label)}
						className="group/collapsible"
					>
						<SidebarGroup>
							<SidebarGroupLabel asChild>
								<CollapsibleTrigger>
									{group.label}
									<ChevronDown className="ml-auto size-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
								</CollapsibleTrigger>
							</SidebarGroupLabel>
							<CollapsibleContent>
								<SidebarGroupContent>
									<SidebarMenu>
										{group.items.map((item) => {
											const Icon = item.icon;
											const showBadge =
												item.href === "/challenges" && showChallengeBadge;
											const isActive = item.href === activeHref;
											return (
												<SidebarMenuItem key={item.href}>
													<SidebarMenuButton asChild isActive={isActive}>
														<Link
															href={item.href}
															aria-current={isActive ? "page" : undefined}
															onClick={closeMobile}
														>
															<Icon />
															<span>{item.title}</span>
															{showBadge ? (
																<span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-warning px-1.5 font-medium text-warning-foreground text-xs">
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
							</CollapsibleContent>
						</SidebarGroup>
					</Collapsible>
				))}
			</SidebarContent>

			<SidebarUserMenu
				userData={userData}
				closeMobile={closeMobile}
				handleSignOut={handleSignOut}
			/>
		</Sidebar>
	);
}
