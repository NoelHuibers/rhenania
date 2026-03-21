import { Badge } from "../ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import type { Role, UserWithRoles } from "./dashboard";

const getRoleBadgeVariant = (roleName: string) => {
  const variants = {
    Admin: "destructive" as const,
    Versorger: "default" as const,
    Fuchsenladen: "secondary" as const,
    Fotowart: "outline" as const,
  };
  return variants[roleName as keyof typeof variants] || "outline";
};

interface RolesTabProps {
  roles: Role[];
  users: UserWithRoles[];
}

export function RolesTab({ roles, users }: RolesTabProps) {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Rollenverwaltung</CardTitle>
          <CardDescription>
            Übersicht über alle verfügbaren Rollen und deren Zuweisungen
          </CardDescription>
        </CardHeader>
      </Card>

      <div className="space-y-4">
        {roles.map((role) => (
          <Card key={role.id}>
            <CardHeader>
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <CardTitle className="text-lg">{role.name}</CardTitle>
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
                  {role.userCount} Benutzer
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-sm text-muted-foreground">
                Zugewiesen an{" "}
                {users.filter((u) => u.roles.some((r) => r.name === role.name)).length}{" "}
                von {users.length} Benutzern
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
