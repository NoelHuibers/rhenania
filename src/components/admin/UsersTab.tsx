import { Search, UserPlus, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { Button } from "../ui/button";
import { Input } from "../ui/input";
import type { UserWithRoles } from "./dashboard";
import { UserCard } from "./UserCard";

interface UsersTabProps {
  filteredUsers: UserWithRoles[];
  searchTerm: string;
  onSearchChange: (term: string) => void;
  isPending: boolean;
  onManageRoles: (user: UserWithRoles) => void;
  onDelete: (user: UserWithRoles) => void;
  onAddUser: () => void;
}

export function UsersTab({
  filteredUsers,
  searchTerm,
  onSearchChange,
  isPending,
  onManageRoles,
  onDelete,
  onAddUser,
}: UsersTabProps) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <Card className="flex-1">
          <CardHeader>
            <CardTitle>Benutzer suchen</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Nach Name oder E-Mail suchen..."
                value={searchTerm}
                onChange={(e) => onSearchChange(e.target.value)}
                className="pl-8"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="sm:w-auto w-full">
          <CardHeader>
            <CardTitle>Aktionen</CardTitle>
          </CardHeader>
          <CardContent>
            <Button
              onClick={onAddUser}
              disabled={isPending}
              className="w-full sm:w-auto"
            >
              <UserPlus className="w-4 h-4 mr-2" />
              Benutzer hinzufügen
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4">
        {filteredUsers.map((user) => (
          <UserCard
            key={user.id}
            user={user}
            isPending={isPending}
            onManageRoles={onManageRoles}
            onDelete={onDelete}
          />
        ))}
      </div>

      {filteredUsers.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-8">
            <Users className="h-12 w-12 text-muted-foreground mb-4" />
            <p className="text-muted-foreground text-center">
              {searchTerm ? "Keine Benutzer gefunden" : "Keine Benutzer vorhanden"}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
