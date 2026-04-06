import { AlertTriangle } from "lucide-react";
import { Button } from "../ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import {
	type Role,
	SINGLE_PERSON_ROLES,
	type UserWithRoles,
} from "./dashboard";

interface RoleManagementDialogProps {
	user: UserWithRoles | null;
	roles: Role[];
	users: UserWithRoles[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRoleToggle: (userId: string, roleId: string) => void;
	isPending: boolean;
}

export function RoleManagementDialog({
	user,
	roles,
	users,
	open,
	onOpenChange,
	onRoleToggle,
	isPending,
}: RoleManagementDialogProps) {
	if (!user) return null;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-lg">Rollen für {user.name}</DialogTitle>
					<DialogDescription>
						Verwalte die Rollenzuweisungen für diesen Benutzer.
					</DialogDescription>
				</DialogHeader>

				<div className="space-y-4 py-4">
					{roles.map((role) => {
						const hasRole = user.roles.some((r) => r.id === role.id);
						const isSinglePerson = SINGLE_PERSON_ROLES.includes(
							role.name as (typeof SINGLE_PERSON_ROLES)[number],
						);
						const holders = users.filter((u) =>
							u.roles.some((r) => r.id === role.id),
						);
						const alreadyTaken =
							isSinglePerson && !hasRole && holders.length >= 1;

						return (
							<div
								key={role.id}
								className="flex items-start justify-between space-x-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<Label
											htmlFor={`role-${role.id}`}
											className="cursor-pointer font-medium text-sm"
										>
											{role.name}
										</Label>
										{isSinglePerson && (
											<span className="text-muted-foreground text-xs">
												(1 Person)
											</span>
										)}
									</div>
									{role.description && (
										<p className="mt-1 text-muted-foreground text-xs">
											{role.description}
										</p>
									)}
									{alreadyTaken && (
										<p className="mt-1 flex items-center gap-1 text-amber-600 text-xs dark:text-amber-400">
											<AlertTriangle className="h-3 w-3" />
											Bereits vergeben an {holders[0]?.name}
										</p>
									)}
								</div>
								<Switch
									id={`role-${role.id}`}
									checked={hasRole}
									onCheckedChange={() => onRoleToggle(user.id, role.id)}
									disabled={isPending}
									className="shrink-0"
								/>
							</div>
						);
					})}
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
						className="w-full sm:w-auto"
					>
						Schließen
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
