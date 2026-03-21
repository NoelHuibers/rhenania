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
  return text.substring(0, maxLength) + "...";
};

const sortRoles = (
  roles: Array<{ id: string; name: string; description: string | null }>
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

export function UserCard({ user, isPending, onManageRoles, onDelete }: UserCardProps) {
  return (
    <Card className="hover:shadow-md transition-shadow">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="flex items-center space-x-3 min-w-0 flex-1">
            <Avatar className="shrink-0">
              <AvatarImage src={user.image || undefined} alt={user.name || ""} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h3
                  className="font-medium truncate sm:max-w-none max-w-60"
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
                className="text-sm text-muted-foreground truncate sm:max-w-none max-w-60"
                title={user.email || ""}
              >
                {truncateText(user.email || "", 40)}
              </p>
            </div>
          </div>
          <div className="flex gap-2 shrink-0 w-full sm:w-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onManageRoles(user)}
              disabled={isPending}
              className="flex-1 sm:flex-none"
            >
              {isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                "Rollen"
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(user)}
              disabled={isPending}
              className="text-destructive hover:text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="mt-4">
          {user.roles.length > 0 ? (
            <UserRoles userRoles={user.roles} maxVisible={3} />
          ) : (
            <p className="text-xs text-muted-foreground italic">
              Keine Rollen zugewiesen
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
