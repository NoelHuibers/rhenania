import { AlertTriangle, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import {
	type Role,
	SINGLE_PERSON_ROLES,
	type UserWithRoles,
} from "./dashboard";

const getInitials = (name: string | null) => {
	if (!name) return "??";
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.substring(0, 2);
};

interface AemterSectionProps {
	roles: Role[];
	users: UserWithRoles[];
	onRoleClick: (role: Role) => void;
}

export function AemterSection({
	roles,
	users,
	onRoleClick,
}: AemterSectionProps) {
	const aemterRoles = roles
		.filter((r) =>
			SINGLE_PERSON_ROLES.includes(
				r.name as (typeof SINGLE_PERSON_ROLES)[number],
			),
		)
		.sort(
			(a, b) =>
				SINGLE_PERSON_ROLES.indexOf(
					a.name as (typeof SINGLE_PERSON_ROLES)[number],
				) -
				SINGLE_PERSON_ROLES.indexOf(
					b.name as (typeof SINGLE_PERSON_ROLES)[number],
				),
		);

	return (
		<div>
			<h2 className="mb-3 font-semibold text-muted-foreground text-sm uppercase tracking-wide">
				Ämter
			</h2>
			<div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
				{aemterRoles.map((role) => {
					const holders = users.filter((u) =>
						u.roles.some((r) => r.name === role.name),
					);
					const holder = holders[0] ?? null;
					const hasConflict = holders.length > 1;

					return (
						<button
							key={role.id}
							type="button"
							onClick={() => onRoleClick(role)}
							className="flex cursor-pointer items-center gap-3 rounded-lg border bg-card p-3 text-left transition-colors hover:bg-muted"
						>
							<Avatar className="h-8 w-8 shrink-0">
								{holder ? (
									<>
										<AvatarImage
											src={holder.image || undefined}
											alt={holder.name || ""}
										/>
										<AvatarFallback className="text-xs">
											{getInitials(holder.name)}
										</AvatarFallback>
									</>
								) : (
									<AvatarFallback className="bg-muted text-muted-foreground">
										<UserRound className="h-4 w-4" />
									</AvatarFallback>
								)}
							</Avatar>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-xs">{role.name}</p>
								{holder ? (
									<p className="truncate text-muted-foreground text-xs">
										{holder.name}
									</p>
								) : (
									<p className="text-muted-foreground text-xs italic">
										Nicht besetzt
									</p>
								)}
							</div>
							{hasConflict && (
								<AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-500" />
							)}
						</button>
					);
				})}
			</div>
		</div>
	);
}
