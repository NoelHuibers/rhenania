import { Shield, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import type { Role, UserWithRoles } from "./dashboard";

interface StatsCardsProps {
  users: UserWithRoles[];
  roles: Role[];
}

export function StatsCards({ users, roles }: StatsCardsProps) {
  return (
    <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Gesamt Benutzer</CardTitle>
          <Users className="h-4 w-4 text-muted-foreground shrink-0" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{users.length}</div>
        </CardContent>
      </Card>

      {roles.map((role) => (
        <Card key={role.id}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium truncate">
              {role.name}
            </CardTitle>
            <Shield className="h-4 w-4 text-muted-foreground shrink-0" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {users.filter((u) => u.roles.some((r) => r.name === role.name)).length}
            </div>
            <p className="text-xs text-muted-foreground">
              Benutzer mit dieser Rolle
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
