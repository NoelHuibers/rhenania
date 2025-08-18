"use client";

import {
  Beer,
  Calculator,
  Coffee,
  LogOut,
  Settings,
  Trophy,
  Truck,
  User,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

const navigationItems = [
  {
    title: "Trinken",
    href: "/trinken",
    icon: Coffee,
    roles: [],
  },
  {
    title: "Rechnung",
    href: "/rechnung",
    icon: Calculator,
    roles: [],
  },
  {
    title: "Literboard",
    href: "/leaderboard",
    icon: Trophy,
    roles: [],
  },
  {
    title: "Admin",
    href: "/admin",
    icon: Settings,
    roles: ["Admin"],
  },
  {
    title: "Versorger",
    href: "/versorger",
    icon: Truck,
    roles: ["Versorger", "Admin"],
  },
  {
    title: "Eloranking",
    href: "/eloranking",
    icon: Beer,
    roles: [],
  },
];

interface AppSidebarProps {
  className?: string;
}

export function AppSidebar({ className }: AppSidebarProps) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const userRoles = session?.user?.roles || [];
  const filteredNavItems = navigationItems.filter(
    (item) =>
      item.roles.length === 0 ||
      item.roles.some((role) => userRoles.includes(role))
  );

  const handleSignOut = async () => {
    try {
      await signOut({ callbackUrl: "/" });
    } catch (error) {
      console.error("Sign out error:", error);
    }
  };

  if (status === "loading") {
    return (
      <Sidebar className={className}>
        <SidebarContent>
          <div className="flex h-full items-center justify-center">
            <div className="text-sm text-sidebar-foreground/60">Loading...</div>
          </div>
        </SidebarContent>
      </Sidebar>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  return (
    <Sidebar className={className} collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2">
          <div className="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground">
            <Coffee className="size-4" />
          </div>
          <div className="grid flex-1 text-left text-sm leading-tight">
            <span className="truncate font-semibold">Rhenania</span>
            <span className="truncate text-xs">Intranet</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = pathname === item.href;

                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href}>
                        <Icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
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
                      src={session.user.image || "/placeholder.svg"}
                      alt={session.user.name || "User"}
                    />
                    <AvatarFallback className="rounded-lg">
                      {session.user.name
                        ?.split(" ")
                        .map((n) => n[0])
                        .join("") || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-semibold">
                      {session.user.name || "Unknown User"}
                    </span>
                    <span className="truncate text-xs">
                      {session.user.email}
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
                <DropdownMenuItem>
                  <User className="mr-2 h-4 w-4" />
                  Profil
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
