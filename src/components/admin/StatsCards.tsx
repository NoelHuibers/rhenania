import { Shield, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import {
	type Role,
	SINGLE_PERSON_ROLES,
	type UserWithRoles,
} from "./dashboard";

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

			{roles.map((role) => {
				const holders = users.filter((u) =>
					u.roles.some((r) => r.name === role.name),
				);
				const isSinglePerson = SINGLE_PERSON_ROLES.includes(
					role.name as (typeof SINGLE_PERSON_ROLES)[number],
				);

				return (
					<Card key={role.id}>
						<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
							<CardTitle className="truncate font-medium text-sm">
								{role.name}
							</CardTitle>
							<Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
						</CardHeader>
						<CardContent>
							{isSinglePerson ? (
								holders.length === 0 ? (
									<p className="text-muted-foreground text-sm italic">
										Nicht besetzt
									</p>
								) : (
									<>
										<p
											className="truncate font-semibold text-sm"
											title={holders[0].name ?? undefined}
										>
											{holders[0].name}
										</p>
										{holders.length > 1 && (
											<p className="mt-1 text-destructive text-xs">
												+{holders.length - 1} weitere
											</p>
										)}
									</>
								)
							) : (
								<>
									<div className="font-bold text-2xl">{holders.length}</div>
									<p className="text-muted-foreground text-xs">
										Benutzer mit dieser Rolle
									</p>
								</>
							)}
						</CardContent>
					</Card>
				);
			})}
		</div>
	);
}
