import { Loader2, Trash2 } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent } from "../ui/card";
import type { UserWithRoles } from "./dashboard";

const getRoleBadgeVariant = (roleName: string) => {
	const variants = {
		Admin: "destructive" as const,
		Versorger: "default" as const,
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

const truncateText = (text: string, maxLength: number) => {
	if (text.length <= maxLength) return text;
	return `${text.substring(0, maxLength)}...`;
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
	maxVisible = 3,
}: {
	userRoles: UserWithRoles["roles"];
	maxVisible?: number;
}) {
	const sortedRoles = sortRoles(userRoles);
	const visibleRoles = sortedRoles.slice(0, maxVisible);
	const hiddenCount = sortedRoles.length - maxVisible;

	return (
		<div className="flex flex-wrap gap-2">
			{visibleRoles.map((role) => (
				<Badge key={role.id} variant={getRoleBadgeVariant(role.name)}>
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
	onManageRoles: (user: UserWithRoles) => void;
	onDelete: (user: UserWithRoles) => void;
}

export function UserCard({
	user,
	isPending,
	onManageRoles,
	onDelete,
}: UserCardProps) {
	return (
		<Card className="transition-shadow hover:shadow-md">
			<CardContent className="p-4">
				<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div className="flex min-w-0 flex-1 items-center space-x-3">
						<Avatar className="shrink-0">
							<AvatarImage
								src={user.image || undefined}
								alt={user.name || ""}
							/>
							<AvatarFallback>{getInitials(user.name)}</AvatarFallback>
						</Avatar>
						<div className="min-w-0 flex-1">
							<div className="flex items-center gap-2">
								<h3
									className="max-w-60 truncate font-medium sm:max-w-none"
									title={user.name || "Unbekannt"}
								>
									{truncateText(user.name || "Unbekannt", 30)}
								</h3>
								{!user.emailVerified && (
									<Badge variant="secondary" className="text-xs">
										Unverifiziert
									</Badge>
								)}
							</div>
							<p
								className="max-w-60 truncate text-muted-foreground text-sm sm:max-w-none"
								title={user.email || ""}
							>
								{truncateText(user.email || "", 40)}
							</p>
						</div>
					</div>
					<div className="flex w-full shrink-0 gap-2 sm:w-auto">
						<Button
							variant="outline"
							size="sm"
							onClick={() => onManageRoles(user)}
							disabled={isPending}
							className="flex-1 sm:flex-none"
						>
							{isPending ? (
								<Loader2 className="h-4 w-4 animate-spin" />
							) : (
								"Rollen"
							)}
						</Button>
						<Button
							variant="outline"
							size="sm"
							onClick={() => onDelete(user)}
							disabled={isPending}
							className="text-destructive hover:bg-destructive/10 hover:text-destructive"
						>
							<Trash2 className="h-4 w-4" />
						</Button>
					</div>
				</div>

				<div className="mt-4">
					{user.roles.length > 0 ? (
						<UserRoles userRoles={user.roles} maxVisible={3} />
					) : (
						<p className="text-muted-foreground text-xs italic">
							Keine Rollen zugewiesen
						</p>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
