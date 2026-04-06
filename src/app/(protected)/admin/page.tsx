// app/admin/page.tsx
import { Suspense } from "react";
import AdminDashboard from "~/components/admin/dashboard";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { Card, CardContent } from "~/components/ui/card";
import { Skeleton } from "~/components/ui/skeleton";
import {
	getRolesWithUserCount,
	getUsersWithRoles,
	initializeRoles,
} from "~/server/actions/admin/admin";

// Loading component for the dashboard
const DashboardSkeleton = () => (
	<div className="min-h-screen bg-background">
		<div className="container mx-auto max-w-7xl space-y-8 p-4">
			{/* Ämter section */}
			<div>
				<Skeleton className="mb-3 h-4 w-12" />
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 7 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-2">
							<Skeleton className="h-7 w-7 shrink-0 rounded-full" />
							<div className="min-w-0 flex-1 space-y-1">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-12" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Gruppen section */}
			<div>
				<Skeleton className="mb-3 h-4 w-16" />
				<div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
					{Array.from({ length: 4 }).map((_, i) => (
						// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
						<div key={i} className="flex items-center gap-2 rounded-lg border bg-card p-2">
							<Skeleton className="h-7 w-7 shrink-0 rounded-full" />
							<div className="min-w-0 flex-1 space-y-1">
								<Skeleton className="h-3 w-16" />
								<Skeleton className="h-3 w-8" />
							</div>
						</div>
					))}
				</div>
			</div>

			{/* Benutzer section */}
			<div>
				<Skeleton className="mb-3 h-4 w-20" />
				<div className="space-y-4">
					<div className="flex flex-col gap-2 sm:flex-row">
						<Skeleton className="h-9 flex-1" />
						<Skeleton className="h-9 w-40 shrink-0" />
					</div>
					<div className="grid gap-4">
						{Array.from({ length: 4 }).map((_, i) => (
							// biome-ignore lint/suspicious/noArrayIndexKey: static skeleton
							<Card key={i}>
								<CardContent className="px-3 py-2">
									<div className="flex items-center gap-3">
										<Skeleton className="h-8 w-8 shrink-0 rounded-full" />
										<div className="min-w-0 flex-1 space-y-1">
											<Skeleton className="h-3.5 w-32" />
											<Skeleton className="h-3 w-40" />
										</div>
										<div className="flex shrink-0 gap-1">
											<Skeleton className="h-8 w-8 sm:h-7 sm:w-7" />
											<Skeleton className="h-8 w-8 sm:h-7 sm:w-14" />
											<Skeleton className="h-8 w-8 sm:h-7 sm:w-7" />
										</div>
									</div>
									<div className="mt-2 border-t pt-2">
										<div className="flex gap-1">
											<Skeleton className="h-4 w-12" />
											<Skeleton className="h-4 w-16" />
										</div>
									</div>
								</CardContent>
							</Card>
						))}
					</div>
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
