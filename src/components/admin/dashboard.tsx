"use client";

import { Loader2, Mail, Search, Shield, UserPlus, Users } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { toggleUserRole } from "../../server/actions/admin";
import { createUser } from "../../server/actions/users";
import { SiteHeader } from "../trinken/SiteHeader";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Label } from "../ui/label";
import { Switch } from "../ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";

export type UserWithRoles = {
  id: string;
  name: string | null;
  email: string;
  image: string | null;
  emailVerified: Date | null;
  roles: Array<{
    id: string;
    name: string;
    description: string | null;
  }>;
};

export type Role = {
  id: string;
  name: string;
  description: string | null;
  userCount: number;
};

export interface AdminDashboardProps {
  initialUsers: UserWithRoles[];
  initialRoles: Role[];
}

const getRoleBadgeVariant = (roleName: string) => {
  const variants = {
    Admin: "destructive" as const,
    Versorger: "default" as const,
    Fuchsenladen: "secondary" as const,
    Bilder: "outline" as const,
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
  roles: Array<{ id: string; name: string; description: string | null }>
) => {
  return [...roles].sort((a, b) => {
    // Admin always comes first
    if (a.name === "Admin") return -1;
    if (b.name === "Admin") return 1;
    // Then sort alphabetically
    return a.name.localeCompare(b.name);
  });
};

const truncateText = (text: string, maxLength: number) => {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
};

function AdminDashboard({ initialUsers, initialRoles }: AdminDashboardProps) {
  const [users, setUsers] = useState<UserWithRoles[]>(initialUsers);
  const [roles] = useState<Role[]>(initialRoles);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserWithRoles | null>(null);
  const [showRoleModal, setShowRoleModal] = useState(false);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState("");
  const [newUserName, setNewUserName] = useState("");
  const [isPending, startTransition] = useTransition();

  const filteredUsers = users.filter(
    (user) =>
      user.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleRoleToggle = async (userId: string, roleId: string) => {
    startTransition(async () => {
      try {
        await toggleUserRole(userId, roleId);

        setUsers((prevUsers) =>
          prevUsers.map((user) => {
            if (user.id === userId) {
              const role = roles.find((r) => r.id === roleId);
              if (!role) return user;

              const hasRole = user.roles.some((r) => r.id === roleId);
              if (hasRole) {
                return {
                  ...user,
                  roles: user.roles.filter((r) => r.id !== roleId),
                };
              } else {
                return {
                  ...user,
                  roles: [...user.roles, role],
                };
              }
            }
            return user;
          })
        );

        // Update selectedUser with the latest data
        setSelectedUser((prevSelected) => {
          if (prevSelected?.id === userId) {
            const role = roles.find((r) => r.id === roleId);
            if (!role) return prevSelected;

            const hasRole = prevSelected.roles.some((r) => r.id === roleId);
            if (hasRole) {
              return {
                ...prevSelected,
                roles: prevSelected.roles.filter((r) => r.id !== roleId),
              };
            } else {
              return {
                ...prevSelected,
                roles: [...prevSelected.roles, role],
              };
            }
          }
          return prevSelected;
        });

        toast.success("Rolle aktualisiert", {
          description: "Die Rollenzuweisung wurde erfolgreich geändert.",
        });
      } catch (error) {
        toast.error("Fehler", {
          description: "Rolle konnte nicht aktualisiert werden.",
        });
      }
    });
  };

  const handleCreateUser = async () => {
    if (!newUserEmail.trim()) {
      toast.error("Fehler", {
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
      });
      return;
    }

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(newUserEmail)) {
      toast.error("Fehler", {
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createUser({
          email: newUserEmail.trim(),
          name: newUserName.trim() || null,
        });

        if (result.success && result.user) {
          // Add the new user to the local state
          setUsers((prevUsers) => [
            ...prevUsers,
            {
              ...result.user!,
              roles: [],
            },
          ]);

          // Reset form and close modal
          setNewUserEmail("");
          setNewUserName("");
          setShowAddUserModal(false);

          toast.success("Benutzer erstellt", {
            description: `Registrierungslink wurde an ${newUserEmail} gesendet.`,
          });
        } else {
          toast.error("Fehler", {
            description:
              result.error || "Benutzer konnte nicht erstellt werden.",
          });
        }
      } catch (error) {
        toast.error("Fehler", {
          description: "Ein unerwarteter Fehler ist aufgetreten.",
        });
      }
    });
  };

  const handleCloseRoleModal = () => {
    setShowRoleModal(false);
    setSelectedUser(null);
  };

  const handleCloseAddUserModal = () => {
    setShowAddUserModal(false);
    setNewUserEmail("");
    setNewUserName("");
  };

  const renderUserRoles = (
    userRoles: UserWithRoles["roles"],
    maxVisible: number = 3
  ) => {
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
  };

  return (
    <div className="min-h-screen bg-background">
      <SiteHeader title="Admin" />
      <div className="container mx-auto p-4 space-y-6 max-w-7xl">
        <div className="flex-col flex items-center md:items-start">
          <p className="text-muted-foreground">Benutzer und Rollen verwalten</p>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">
                Gesamt Benutzer
              </CardTitle>
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
                  {
                    users.filter((u) =>
                      u.roles.some((r) => r.name === role.name)
                    ).length
                  }
                </div>
                <p className="text-xs text-muted-foreground">
                  Benutzer mit dieser Rolle
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Tabs defaultValue="users" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="users" className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span className="hidden sm:inline">Benutzer</span>
              <span className="sm:hidden">Users</span>
            </TabsTrigger>
            <TabsTrigger value="roles" className="flex items-center gap-2">
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">Rollen</span>
              <span className="sm:hidden">Roles</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="users" className="space-y-4">
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
                      onChange={(e) => setSearchTerm(e.target.value)}
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
                    onClick={() => setShowAddUserModal(true)}
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
                <Card
                  key={user.id}
                  className="hover:shadow-md transition-shadow"
                >
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="flex items-center space-x-3 min-w-0 flex-1">
                        <Avatar className="shrink-0">
                          <AvatarImage
                            src={user.image || undefined}
                            alt={user.name || ""}
                          />
                          <AvatarFallback>
                            {getInitials(user.name)}
                          </AvatarFallback>
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
                            title={user.email}
                          >
                            {truncateText(user.email, 40)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedUser(user);
                          setShowRoleModal(true);
                        }}
                        disabled={isPending}
                        className="shrink-0 w-full sm:w-auto"
                      >
                        {isPending ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          "Rollen"
                        )}
                      </Button>
                    </div>

                    <div className="mt-4">
                      {user.roles.length > 0 ? (
                        renderUserRoles(user.roles, 3)
                      ) : (
                        <p className="text-xs text-muted-foreground italic">
                          Keine Rollen zugewiesen
                        </p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            {filteredUsers.length === 0 && (
              <Card>
                <CardContent className="flex flex-col items-center justify-center py-8">
                  <Users className="h-12 w-12 text-muted-foreground mb-4" />
                  <p className="text-muted-foreground text-center">
                    {searchTerm
                      ? "Keine Benutzer gefunden"
                      : "Keine Benutzer vorhanden"}
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="roles" className="space-y-4">
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
                      {
                        users.filter((u) =>
                          u.roles.some((r) => r.name === role.name)
                        ).length
                      }{" "}
                      von {users.length} Benutzern
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>
        </Tabs>

        {/* Add User Modal */}
        <Dialog open={showAddUserModal} onOpenChange={handleCloseAddUserModal}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5" />
                Neuen Benutzer hinzufügen
              </DialogTitle>
              <DialogDescription>
                Geben Sie die E-Mail-Adresse des neuen Benutzers ein. Ein
                Registrierungslink wird an diese Adresse gesendet.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="user-email">
                  E-Mail-Adresse <span className="text-red-500">*</span>
                </Label>
                <div className="relative">
                  <Mail className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="user-email"
                    type="email"
                    placeholder="benutzer@beispiel.de"
                    value={newUserEmail}
                    onChange={(e) => setNewUserEmail(e.target.value)}
                    className="pl-8"
                    disabled={isPending}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="user-name">Name (optional)</Label>
                <Input
                  id="user-name"
                  type="text"
                  placeholder="Max Mustermann"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  disabled={isPending}
                />
              </div>
            </div>

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={handleCloseAddUserModal}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                Abbrechen
              </Button>
              <Button
                onClick={handleCreateUser}
                disabled={isPending}
                className="w-full sm:w-auto"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Wird erstellt...
                  </>
                ) : (
                  <>
                    <UserPlus className="w-4 h-4 mr-2" />
                    Benutzer erstellen
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Role Management Modal */}
        {selectedUser && (
          <Dialog open={showRoleModal} onOpenChange={handleCloseRoleModal}>
            <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-lg">
                  Rollen für {selectedUser.name}
                </DialogTitle>
                <DialogDescription>
                  Verwalte die Rollenzuweisungen für diesen Benutzer.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                {roles.map((role) => {
                  const hasRole = selectedUser.roles.some(
                    (r) => r.id === role.id
                  );
                  return (
                    <div
                      key={role.id}
                      className="flex items-start justify-between space-x-3 py-2"
                    >
                      <div className="flex-1 min-w-0">
                        <Label
                          htmlFor={`role-${role.id}`}
                          className="text-sm font-medium cursor-pointer"
                        >
                          {role.name}
                        </Label>
                        {role.description && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {role.description}
                          </p>
                        )}
                      </div>
                      <Switch
                        id={`role-${role.id}`}
                        checked={hasRole}
                        onCheckedChange={() =>
                          handleRoleToggle(selectedUser.id, role.id)
                        }
                        disabled={isPending}
                        className="shrink-0"
                      />
                    </div>
                  );
                })}
              </div>

              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={handleCloseRoleModal}
                  disabled={isPending}
                  className="w-full sm:w-auto"
                >
                  Schließen
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}

export default AdminDashboard;
