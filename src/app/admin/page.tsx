// app/admin/page.tsx
import { Suspense } from "react";
import AdminDashboard from "~/components/admin/dashboard";
import { SidebarLayout } from "~/components/sidebar/sidebar-layout";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
  getRolesWithUserCount,
  getUsersWithRoles,
  initializeRoles,
} from "~/server/actions/admin/admin";

// Loading component for the dashboard
const DashboardSkeleton = () => (
  <div className="min-h-screen bg-background p-4">
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-4 w-96" />
      </div>

      {/* Stats cards skeleton */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Card key={i}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between space-y-0 pb-2">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-4 w-4" />
              </div>
              <Skeleton className="h-8 w-12" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs skeleton */}
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />

        {/* Search card skeleton */}
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-4 w-32 mb-4" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>

        {/* User cards skeleton */}
        <div className="grid gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center space-x-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div className="space-y-1">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-16" />
                </div>
                <div className="mt-4 flex space-x-2">
                  <Skeleton className="h-5 w-16" />
                  <Skeleton className="h-5 w-20" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  </div>
);

// Main data fetching component
async function AdminDashboardData() {
  try {
    // Initialize roles first
    await initializeRoles();

    // Fetch users and roles in parallel
    const [users, roles] = await Promise.all([
      getUsersWithRoles(),
      getRolesWithUserCount(),
    ]);

    return <AdminDashboard initialUsers={users} initialRoles={roles} />;
  } catch (error) {
    console.error("Failed to load admin dashboard data:", error);
    throw error;
  }
}

// Main page component
export default function AdminPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <SidebarLayout>
        <AdminDashboardData />
      </SidebarLayout>
    </Suspense>
  );
}

export const metadata = {
  title: "Admin Dashboard - Rhenania",
  description: "Verwaltung von Benutzern und Rollen",
};
