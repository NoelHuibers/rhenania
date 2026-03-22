import { Shield, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { Role, UserWithRoles } from "./dashboard";

interface StatsCardsProps {
	users: UserWithRoles[];
	roles: Role[];
}

export function StatsCards({ users, roles }: StatsCardsProps) {
	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
			<Card>
				<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
					<CardTitle className="font-medium text-sm">Gesamt Benutzer</CardTitle>
					<Users className="h-4 w-4 shrink-0 text-muted-foreground" />
				</CardHeader>
				<CardContent>
					<div className="font-bold text-2xl">{users.length}</div>
				</CardContent>
			</Card>

			{roles.map((role) => (
				<Card key={role.id}>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="truncate font-medium text-sm">
							{role.name}
						</CardTitle>
						<Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{
								users.filter((u) => u.roles.some((r) => r.name === role.name))
									.length
							}
						</div>
						<p className="text-muted-foreground text-xs">
							Benutzer mit dieser Rolle
						</p>
					</CardContent>
				</Card>
			))}
		</div>
	);
}
