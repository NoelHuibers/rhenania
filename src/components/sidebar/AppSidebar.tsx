import { getUserProfile } from "~/server/actions/profile/profile";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import { AppSidebarClient } from "./AppSidebarClient";

export interface AppSidebarProps {
	className?: string;
}

export async function AppSidebar({ className }: AppSidebarProps) {
	const [userData, tenant] = await Promise.all([
		getUserProfile(),
		getCurrentTenant(),
	]);

	const safeUserData = {
		name: userData?.name ?? null,
		email: userData?.email ?? null,
		image: userData?.image ?? null,
		roles: Array.isArray(userData?.roles) ? userData?.roles : [],
	};

	return (
		<AppSidebarClient
			className={className}
			userData={safeUserData}
			tenantName={tenant?.displayName ?? "Corps"}
		/>
	);
}
