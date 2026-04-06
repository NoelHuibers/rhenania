import { Search, UserPlus, Users } from "lucide-react";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import { Input } from "../ui/input";
import type { UserWithRoles } from "./dashboard";
import { UserCard } from "./UserCard";

interface UsersTabProps {
	filteredUsers: UserWithRoles[];
	searchTerm: string;
	onSearchChange: (term: string) => void;
	isPending: boolean;
	onEdit: (user: UserWithRoles) => void;
	onManageRoles: (user: UserWithRoles) => void;
	onDelete: (user: UserWithRoles) => void;
	onAddUser: () => void;
}

export function UsersTab({
	filteredUsers,
	searchTerm,
	onSearchChange,
	isPending,
	onEdit,
	onManageRoles,
	onDelete,
	onAddUser,
}: UsersTabProps) {
	return (
		<div className="space-y-4">
			<div className="flex flex-col gap-2 sm:flex-row sm:items-center">
				<div className="relative flex-1">
					<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
					<Input
						placeholder="Nach Name oder E-Mail suchen..."
						value={searchTerm}
						onChange={(e) => onSearchChange(e.target.value)}
						className="pl-9"
					/>
				</div>
				<Button onClick={onAddUser} disabled={isPending} className="shrink-0">
					<UserPlus className="mr-2 h-4 w-4" />
					Benutzer hinzufügen
				</Button>
			</div>

			<div className="grid gap-4">
				{filteredUsers.map((user) => (
					<UserCard
						key={user.id}
						user={user}
						isPending={isPending}
						onEdit={onEdit}
						onManageRoles={onManageRoles}
						onDelete={onDelete}
					/>
				))}
			</div>

			{filteredUsers.length === 0 && (
				<Card>
					<CardContent className="flex flex-col items-center justify-center py-8">
						<Users className="mb-4 h-12 w-12 text-muted-foreground" />
						<p className="text-center text-muted-foreground">
							{searchTerm
								? "Keine Benutzer gefunden"
								: "Keine Benutzer vorhanden"}
						</p>
					</CardContent>
				</Card>
			)}
		</div>
	);
}
