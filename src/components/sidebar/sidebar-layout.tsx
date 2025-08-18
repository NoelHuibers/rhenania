import { SidebarProvider } from "../ui/sidebar";
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
        <div className="flex-1 h-full">{children}</div>
      </main>
    </SidebarProvider>
  );
}
