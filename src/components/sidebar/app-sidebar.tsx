"use client";

import {
  Calculator,
  Coffee,
  LogOut,
  Menu,
  Settings,
  Trophy,
  Truck,
  User,
  X,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { cn } from "~/lib/utils";

const navigationItems = [
  {
    title: "Trinken",
    href: "/trinken",
    icon: Coffee,
    roles: [], // No roles required - accessible to all authenticated users
  },
  {
    title: "Rechnung",
    href: "/rechnung",
    icon: Calculator,
    roles: [], // No roles required - accessible to all authenticated users
  },
  {
    title: "Literboard",
    href: "/leaderboard",
    icon: Trophy,
    roles: [], // No roles required - accessible to all authenticated users
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
    roles: ["Versorger"],
  },
];

interface AppSidebarProps {
  className?: string;
}

export function AppSidebar({ className }: AppSidebarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const { data: session, status } = useSession();

  // Extract user roles from session
  const userRoles = session?.user?.roles || [];

  // Filter navigation items based on user roles
  // Items with empty roles array are accessible to all authenticated users
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

  // Show loading state or return null if not authenticated
  if (status === "loading") {
    return (
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border",
          className
        )}
      >
        <div className="flex h-full items-center justify-center">
          <div className="text-sm text-sidebar-foreground/60">Loading...</div>
        </div>
      </aside>
    );
  }

  if (status === "unauthenticated" || !session?.user) {
    return null;
  }

  const SidebarContent = () => (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-sidebar-border">
        <h2 className="text-lg font-semibold text-sidebar-foreground">
          Rhenania Intranet
        </h2>
        <Button
          variant="ghost"
          size="sm"
          className="md:hidden"
          onClick={() => setIsOpen(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {filteredNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setIsOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.title}
            </Link>
          );
        })}
      </nav>

      {/* User Profile */}
      <div className="p-4 border-t border-sidebar-border">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              className="w-full justify-start gap-3 p-2 h-auto"
            >
              <Avatar className="h-8 w-8">
                <AvatarImage
                  src={session.user.image || "/placeholder.svg"}
                  alt={session.user.name || "User"}
                />
                <AvatarFallback>
                  {session.user.name
                    ?.split(" ")
                    .map((n) => n[0])
                    .join("") || "U"}
                </AvatarFallback>
              </Avatar>
              <div className="flex flex-col items-start text-sm">
                <span className="font-medium text-sidebar-foreground truncate max-w-[140px]">
                  {session.user.name || "Unknown User"}
                </span>
                <span className="text-xs text-sidebar-foreground/60 truncate max-w-[140px]">
                  {session.user.email}
                </span>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
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
      </div>
    </div>
  );

  return (
    <>
      {/* Mobile Menu Button */}
      <Button
        variant="ghost"
        size="sm"
        className="fixed top-4 left-2 z-50 md:hidden"
        onClick={() => setIsOpen(true)}
      >
        <Menu className="h-4 w-4" />
      </Button>

      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed left-0 top-0 z-50 h-full w-64 bg-sidebar border-r border-sidebar-border transition-transform duration-300 ease-in-out md:relative md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
          className
        )}
      >
        <SidebarContent />
      </aside>
    </>
  );
}
