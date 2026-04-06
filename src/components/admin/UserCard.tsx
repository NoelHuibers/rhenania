import { Loader2, Pencil, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import type { UserWithRoles } from "./dashboard";

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

const sortRoles = (
	roles: Array<{ id: string; name: string; description: string | null }>,
) => {
	return [...roles].sort((a, b) => {
		if (a.name === "Admin") return -1;
		if (b.name === "Admin") return 1;
		return a.name.localeCompare(b.name);
	});
};

function UserRoles({
	userRoles,
	maxVisible = 4,
}: {
	userRoles: UserWithRoles["roles"];
	maxVisible?: number;
}) {
	const sortedRoles = sortRoles(userRoles);
	const visibleRoles = sortedRoles.slice(0, maxVisible);
	const hiddenCount = sortedRoles.length - maxVisible;

	return (
		<div className="flex flex-wrap gap-1">
			{visibleRoles.map((role) => (
				<Badge
					key={role.id}
					variant={getRoleBadgeVariant(role.name)}
					className="text-xs"
				>
					{role.name}
				</Badge>
			))}
			{hiddenCount > 0 && (
				<Badge variant="outline" className="text-xs">
					+{hiddenCount}
				</Badge>
			)}
		</div>
	);
}

interface UserCardProps {
	user: UserWithRoles;
	isPending: boolean;
	onEdit: (user: UserWithRoles) => void;
	onManageRoles: (user: UserWithRoles) => void;
	onDelete: (user: UserWithRoles) => void;
}

export function UserCard({
	user,
	isPending,
	onEdit,
	onManageRoles,
	onDelete,
}: UserCardProps) {
	const actions = (
		<div className="flex shrink-0 gap-1">
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8"
				onClick={() => onEdit(user)}
				disabled={isPending}
			>
				<Pencil className="h-3.5 w-3.5" />
			</Button>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => onManageRoles(user)}
				disabled={isPending}
				className="h-8 px-2 text-xs"
			>
				{isPending ? (
					<Loader2 className="h-3.5 w-3.5 animate-spin" />
				) : (
					"Rollen"
				)}
			</Button>
			<Button
				variant="ghost"
				size="icon"
				className="h-8 w-8 text-destructive hover:bg-destructive/10 hover:text-destructive"
				onClick={() => onDelete(user)}
				disabled={isPending}
			>
				<Trash2 className="h-3.5 w-3.5" />
			</Button>
		</div>
	);

	return (
		<Card className="py-0 transition-shadow hover:shadow-sm">
			<CardContent className="px-3 py-2">
				{/* Top row: avatar + name/email (+ actions on sm+) */}
				<div className="flex items-center gap-3">
					<Avatar className="h-8 w-8 shrink-0">
						<AvatarImage src={user.image || undefined} alt={user.name || ""} />
						<AvatarFallback className="text-xs">
							{getInitials(user.name)}
						</AvatarFallback>
					</Avatar>

					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<p
								className="truncate font-medium text-sm"
								title={user.name || "Unbekannt"}
							>
								{user.name || "Unbekannt"}
							</p>
							{!user.emailVerified && (
								<Badge variant="secondary" className="shrink-0 text-xs">
									Unverifiziert
								</Badge>
							)}
						</div>
						<p
							className="truncate text-muted-foreground text-xs"
							title={user.email || ""}
						>
							{user.email}
						</p>
					</div>

					{/* Actions: desktop only */}
					<div className="hidden sm:block">{actions}</div>
				</div>

				{/* Bottom row: roles + actions on mobile */}
				<div className="mt-2 flex items-center gap-2 border-t pt-2">
					<div className="min-w-0 flex-1">
						{user.roles.length > 0 ? (
							<UserRoles userRoles={user.roles} maxVisible={3} />
						) : (
							<p className="text-muted-foreground text-xs italic">
								Keine Rollen zugewiesen
							</p>
						)}
					</div>
					{/* Actions: mobile only */}
					<div className="shrink-0 sm:hidden">{actions}</div>
				</div>
			</CardContent>
		</Card>
	);
}
