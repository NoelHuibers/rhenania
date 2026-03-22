"use client";

import { Shield, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleUserRole } from "../../server/actions/admin/admin";
import { SiteHeader } from "../trinken/SiteHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { AddUserDialog } from "./AddUserDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { RoleManagementDialog } from "./RoleManagementDialog";
import { RolesTab } from "./RolesTab";
import { StatsCards } from "./StatsCards";
import { UsersTab } from "./UsersTab";

export type UserWithRoles = {
	id: string;
	name: string | null;
	email: string | null;
	emailVerified: Date | null;
	image: string | null;
	roles: Array<{
		id: string;
		name: string;
		description: string | null;
	}>;
};

export type Role = {
	id: string;
	name: string;
	description: string | null;
	userCount: number;
};

export interface AdminDashboardProps {
	initialUsers: UserWithRoles[];
	initialRoles: Role[];
}

function AdminDashboard({ initialUsers, initialRoles }: AdminDashboardProps) {
	const [users, setUsers] = useState<UserWithRoles[]>(initialUsers);
	const [roles] = useState<Role[]>(initialRoles);
	const [searchTerm, setSearchTerm] = useState("");
	const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
	const [showRoleModal, setShowRoleModal] = useState(false);
	const [showAddUserModal, setShowAddUserModal] = useState(false);
	const [userToDelete, setUserToDelete] = useState<UserWithRoles | null>(null);
	const [showDeleteModal, setShowDeleteModal] = useState(false);
	const [isPending, startTransition] = useTransition();

	const filteredUsers = users.filter(
		(user) =>
			user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
			user.email?.toLowerCase().includes(searchTerm.toLowerCase()),
	);

	const handleRoleToggle = (userId: string, roleId: string) => {
		startTransition(async () => {
			try {
				await toggleUserRole(userId, roleId);

				const applyToggle = <
					T extends { id: string; roles: UserWithRoles["roles"] },
				>(
					user: T,
				): T => {
					if (user.id !== userId) return user;
					const role = roles.find((r) => r.id === roleId);
					if (!role) return user;
					const hasRole = user.roles.some((r) => r.id === roleId);
					return {
						...user,
						roles: hasRole
							? user.roles.filter((r) => r.id !== roleId)
							: [...user.roles, role],
					};
				};

				setUsers((prev) => prev.map(applyToggle));
				setSelectedUser((prev) => (prev ? applyToggle(prev) : prev));

				toast.success("Rolle aktualisiert", {
					description: "Die Rollenzuweisung wurde erfolgreich geändert.",
				});
			} catch {
				toast.error("Fehler", {
					description: "Rolle konnte nicht aktualisiert werden.",
				});
			}
		});
	};

	const handleCloseRoleModal = () => {
		setShowRoleModal(false);
		setSelectedUser(null);
	};

	return (
		<div className="min-h-screen bg-background">
			<SiteHeader title="Admin" />
			<div className="container mx-auto max-w-7xl space-y-6 p-4">
				<div className="flex flex-col items-center md:items-start">
					<p className="text-muted-foreground">Benutzer und Rollen verwalten</p>
				</div>

				<StatsCards users={users} roles={roles} />

				<Tabs defaultValue="users" className="space-y-4">
					<TabsList className="grid w-full grid-cols-2">
						<TabsTrigger value="users" className="flex items-center gap-2">
							<Users className="h-4 w-4" />
							<span className="hidden sm:inline">Benutzer</span>
							<span className="sm:hidden">Users</span>
						</TabsTrigger>
						<TabsTrigger value="roles" className="flex items-center gap-2">
							<Shield className="h-4 w-4" />
							<span className="hidden sm:inline">Rollen</span>
							<span className="sm:hidden">Roles</span>
						</TabsTrigger>
					</TabsList>

					<TabsContent value="users">
						<UsersTab
							filteredUsers={filteredUsers}
							searchTerm={searchTerm}
							onSearchChange={setSearchTerm}
							isPending={isPending}
							onManageRoles={(user) => {
								setSelectedUser(user);
								setShowRoleModal(true);
							}}
							onDelete={(user) => {
								setUserToDelete(user);
								setShowDeleteModal(true);
							}}
							onAddUser={() => setShowAddUserModal(true)}
						/>
					</TabsContent>

					<TabsContent value="roles">
						<RolesTab roles={roles} users={users} />
					</TabsContent>
				</Tabs>

				<AddUserDialog
					open={showAddUserModal}
					onOpenChange={setShowAddUserModal}
					onUserCreated={(user) =>
						setUsers((prev) => [...prev, { ...user, roles: [] }])
					}
				/>

				<DeleteUserDialog
					user={userToDelete}
					open={showDeleteModal}
					onOpenChange={(open) => {
						setShowDeleteModal(open);
						if (!open) setUserToDelete(null);
					}}
					onUserDeleted={(userId) =>
						setUsers((prev) => prev.filter((u) => u.id !== userId))
					}
				/>

				<RoleManagementDialog
					user={selectedUser}
					roles={roles}
					open={showRoleModal}
					onOpenChange={(open) => {
						if (!open) handleCloseRoleModal();
					}}
					onRoleToggle={handleRoleToggle}
					isPending={isPending}
				/>
			</div>
		</div>
	);
}

export default AdminDashboard;
