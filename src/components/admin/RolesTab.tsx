import { AlertTriangle, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import {
	type Role,
	SINGLE_PERSON_ROLES,
	type UserWithRoles,
} from "./dashboard";

const getRoleBadgeVariant = (roleName: string) => {
	const variants = {
		Admin: "destructive" as const,
		Getränkewart: "default" as const,
		Fuchsenladen: "secondary" as const,
		Fotowart: "outline" as const,
	};
	return variants[roleName as keyof typeof variants] || "outline";
};

const getInitials = (name: string | null) => {
	if (!name) return "??";
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.substring(0, 2);
};

interface RolesTabProps {
	roles: Role[];
	users: UserWithRoles[];
}

export function RolesTab({ roles, users }: RolesTabProps) {
	return (
		<div className="grid gap-4 sm:grid-cols-2">
			{roles.map((role) => {
				const holders = users.filter((u) =>
					u.roles.some((r) => r.name === role.name),
				);
				const isSinglePerson = SINGLE_PERSON_ROLES.includes(
					role.name as (typeof SINGLE_PERSON_ROLES)[number],
				);
				const hasConflict = isSinglePerson && holders.length > 1;

				return (
					<Card key={role.id}>
						<CardHeader className="pb-3">
							<div className="flex items-start justify-between gap-2">
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2">
										<CardTitle className="text-base">{role.name}</CardTitle>
										{isSinglePerson && (
											<Badge variant="outline" className="text-xs">
												1 Person
											</Badge>
										)}
										{hasConflict && (
											<AlertTriangle className="h-4 w-4 text-amber-500" />
										)}
									</div>
									{role.description && (
										<CardDescription className="mt-1">
											{role.description}
										</CardDescription>
									)}
								</div>
								<Badge
									variant={getRoleBadgeVariant(role.name)}
									className="shrink-0"
								>
									{holders.length}
								</Badge>
							</div>
						</CardHeader>
						<CardContent className="pt-0">
							{isSinglePerson ? (
								holders.length === 0 ? (
									<p className="flex items-center gap-2 text-muted-foreground text-sm italic">
										<User className="h-4 w-4" />
										Nicht besetzt
									</p>
								) : (
									<div className="space-y-2">
										{holders.map((holder) => (
											<div key={holder.id} className="flex items-center gap-2">
												<Avatar className="h-6 w-6">
													<AvatarImage
														src={holder.image || undefined}
														alt={holder.name || ""}
													/>
													<AvatarFallback className="text-xs">
														{getInitials(holder.name)}
													</AvatarFallback>
												</Avatar>
												<span className="text-sm">{holder.name}</span>
											</div>
										))}
										{hasConflict && (
											<p className="text-amber-600 text-xs dark:text-amber-400">
												Diese Rolle sollte nur einer Person zugewiesen sein.
											</p>
										)}
									</div>
								)
							) : (
								<p className="text-muted-foreground text-sm">
									{holders.length} von {users.length} Benutzern zugewiesen
								</p>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
