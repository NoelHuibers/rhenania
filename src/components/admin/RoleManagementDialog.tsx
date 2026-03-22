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
import type { Role, UserWithRoles } from "./dashboard";

interface RoleManagementDialogProps {
	user: UserWithRoles | null;
	roles: Role[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onRoleToggle: (userId: string, roleId: string) => void;
	isPending: boolean;
}

export function RoleManagementDialog({
	user,
	roles,
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
						return (
							<div
								key={role.id}
								className="flex items-start justify-between space-x-3 py-2"
							>
								<div className="min-w-0 flex-1">
									<Label
										htmlFor={`role-${role.id}`}
										className="cursor-pointer font-medium text-sm"
									>
										{role.name}
									</Label>
									{role.description && (
										<p className="mt-1 text-muted-foreground text-xs">
											{role.description}
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
