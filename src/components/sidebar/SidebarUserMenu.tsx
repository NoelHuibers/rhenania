"use client";

import { LogOut, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import {
	SidebarFooter,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "~/components/ui/sidebar";
import type { AppSidebarClientProps } from "./AppSidebarClient";

function initials(name?: string | null) {
	if (!name) {
		return "U";
	}
	return name
		.split(" ")
		.filter(Boolean)
		.map((n) => n[0]?.toUpperCase())
		.slice(0, 2)
		.join("");
}

/** Sidebar footer with the signed-in user and the profile / sign-out menu. */
export function SidebarUserMenu({
	userData,
	closeMobile,
	handleSignOut,
}: {
	userData: AppSidebarClientProps["userData"];
	closeMobile: () => void;
	handleSignOut: () => void;
}) {
	return (
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
							className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
							side="bottom"
							align="end"
							sideOffset={4}
						>
							<DropdownMenuItem asChild>
								<Link href="/profile" onClick={closeMobile}>
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
	);
}
