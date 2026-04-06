import { Users } from "lucide-react";
import { Badge } from "../ui/badge";
import {
	type Role,
	SINGLE_PERSON_ROLES,
	type UserWithRoles,
} from "./dashboard";

interface GruppenSectionProps {
	roles: Role[];
	users: UserWithRoles[];
	onRoleClick: (role: Role) => void;
}

export function GruppenSection({
	roles,
	users,
	onRoleClick,
}: GruppenSectionProps) {
	const gruppenRoles = roles.filter(
		(r) =>
			!SINGLE_PERSON_ROLES.includes(
				r.name as (typeof SINGLE_PERSON_ROLES)[number],
			) && r.name !== "Admin",
	);

	if (gruppenRoles.length === 0) return null;

	return (
		<div>
			<h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
				Gruppen
			</h2>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				{gruppenRoles.map((role) => {
					const count = users.filter((u) =>
						u.roles.some((r) => r.id === role.id),
					).length;

					return (
						<button
							key={role.id}
							type="button"
							onClick={() => onRoleClick(role)}
							className="flex items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted"
						>
							<div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
								<Users className="h-4 w-4 text-muted-foreground" />
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-xs">{role.name}</p>
								{role.description && (
									<p className="truncate text-muted-foreground text-xs">
										{role.description}
									</p>
								)}
							</div>
							<Badge variant="secondary" className="shrink-0 text-xs">
								{count}
							</Badge>
						</button>
					);
				})}
			</div>
		</div>
	);
}
