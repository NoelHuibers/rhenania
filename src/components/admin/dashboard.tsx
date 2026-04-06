"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleUserRole } from "../../server/actions/admin/admin";
import { SiteHeader } from "../trinken/SiteHeader";
import { AddUserDialog } from "./AddUserDialog";
import { AemterSection } from "./AemterSection";
import { BulkRoleDialog } from "./BulkRoleDialog";
import { DeleteUserDialog } from "./DeleteUserDialog";
import { EditUserDialog } from "./EditUserDialog";
import { GruppenSection } from "./GruppenSection";
import { RoleManagementDialog } from "./RoleManagementDialog";
import { UsersTab } from "./UsersTab";

export const SINGLE_PERSON_ROLES = [
	"Senior",
	"Consenior",
	"Subsenior",
	"Fuchsmajor",
	"CC-Kasse",
	"Getränkewart",
	"Aktivenkasse",
] as const;

export type UserWithRoles = {
	id: string;
	name: string | null;
	email: string | null;
	emailVerified: boolean | null;
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
	const [userToEdit, setUserToEdit] = useState<UserWithRoles | null>(null);
	const [showEditModal, setShowEditModal] = useState(false);
	const [bulkRole, setBulkRole] = useState<Role | null>(null);
	const [showBulkModal, setShowBulkModal] = useState(false);
	const [isPending, startTransition] = useTransition();

	const filteredUsers = users
		.filter(
			(user) =>
				user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
				user.email?.toLowerCase().includes(searchTerm.toLowerCase()),
		)
		.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));

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
			<div className="container mx-auto max-w-7xl space-y-8 p-4">
				<AemterSection
					roles={roles}
					users={users}
					onRoleClick={(role) => {
						setBulkRole(role);
						setShowBulkModal(true);
					}}
				/>

				<GruppenSection
					roles={roles}
					users={users}
					onRoleClick={(role) => {
						setBulkRole(role);
						setShowBulkModal(true);
					}}
				/>

				<div>
					<h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
						Benutzer ({users.length})
					</h2>
					<UsersTab
						filteredUsers={filteredUsers}
						searchTerm={searchTerm}
						onSearchChange={setSearchTerm}
						isPending={isPending}
						onEdit={(user) => {
							setUserToEdit(user);
							setShowEditModal(true);
						}}
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
				</div>

				<AddUserDialog
					open={showAddUserModal}
					onOpenChange={setShowAddUserModal}
					onUserCreated={(user) =>
						setUsers((prev) => [...prev, { ...user, roles: [] }])
					}
				/>

				<EditUserDialog
					user={userToEdit}
					open={showEditModal}
					onOpenChange={(open) => {
						setShowEditModal(open);
						if (!open) setUserToEdit(null);
					}}
					onUserUpdated={(userId, name, email) =>
						setUsers((prev) =>
							prev.map((u) => (u.id === userId ? { ...u, name, email } : u)),
						)
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

				<BulkRoleDialog
					role={bulkRole}
					users={users}
					open={showBulkModal}
					onOpenChange={(open) => {
						setShowBulkModal(open);
						if (!open) setBulkRole(null);
					}}
					onSaved={(roleId, userIds) => {
						setUsers((prev) =>
							prev.map((u) => {
								const role = roles.find((r) => r.id === roleId);
								if (!role) return u;
								const hasRole = userIds.includes(u.id);
								const alreadyHas = u.roles.some((r) => r.id === roleId);
								if (hasRole && !alreadyHas)
									return { ...u, roles: [...u.roles, role] };
								if (!hasRole && alreadyHas)
									return {
										...u,
										roles: u.roles.filter((r) => r.id !== roleId),
									};
								return u;
							}),
						);
					}}
				/>

				<RoleManagementDialog
					user={selectedUser}
					roles={roles}
					users={users}
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
