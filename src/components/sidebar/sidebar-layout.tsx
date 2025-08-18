import { SidebarProvider, SidebarTrigger } from "../ui/sidebar";
import { AppSidebar } from "./app-sidebar";

// Wrapper component that includes the SidebarProvider
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
      <main className="flex flex-1 flex-col min-h-screen">
        {/* Floating trigger button */}
        <SidebarTrigger className="fixed top-4 left-4 z-40 lg:hidden" />

        {/* Full height content */}
        <div className="flex-1 h-full">{children}</div>
      </main>
    </SidebarProvider>
  );
}
