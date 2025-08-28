"use client";

import { Camera, Edit, RefreshCw, FolderSyncIcon as Sync } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import {
  getUserProfile,
  refreshProfile,
  syncFromMicrosoft,
  updateUserAvatar,
  updateUserName,
} from "~/server/actions/profile/profile";

interface User {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  roles: string[];
}

export function ProfileIdentity() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [newAvatarUrl, setNewAvatarUrl] = useState("");
  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const userData = await getUserProfile();
        setUser(userData);
        setNewName(userData.name || "");
        setLoading(false);
      } catch (error) {
        toast.error("Failed to load profile data");
        setLoading(false);
      }
    };

    fetchUserData();
  }, []);

  const handleNameEdit = () => {
    if (!newName.trim()) {
      toast.error("Name cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("name", newName.trim());

        const result = await updateUserName(formData);

        if (result.success) {
          toast.success(result.message);
          setNameDialogOpen(false);
          // Update local state
          if (user) {
            setUser({ ...user, name: newName.trim() });
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to update name"
        );
      }
    });
  };

  const handleAvatarChange = () => {
    if (!newAvatarUrl.trim()) {
      toast.error("Image URL cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("imageUrl", newAvatarUrl.trim());

        const result = await updateUserAvatar(formData);

        if (result.success) {
          toast.success(result.message);
          setAvatarDialogOpen(false);
          // Update local state
          if (user) {
            setUser({ ...user, image: newAvatarUrl.trim() });
          }
          setNewAvatarUrl("");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to update profile picture"
        );
      }
    });
  };

  const handleSync = () => {
    startTransition(async () => {
      try {
        const result = await syncFromMicrosoft();

        if (result.success) {
          toast.success(result.message);
          // Refetch user data after sync
          const userData = await getUserProfile();
          setUser(userData);
          setNewName(userData.name || "");
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Failed to sync from Microsoft"
        );
      }
    });
  };

  const handleRefresh = () => {
    startTransition(async () => {
      try {
        const result = await refreshProfile();

        if (result.success) {
          toast.success(result.message);
          // Refetch user data after refresh
          const userData = await getUserProfile();
          setUser(userData);
          setNewName(userData.name || "");
          router.refresh(); // Refresh the page data
        }
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Failed to refresh profile"
        );
      }
    });
  };

  const getInitials = (name: string | null) => {
    if (!name) return "U";
    return name
      .split(" ")
      .map((n) => n[0])
      .join("")
      .toUpperCase();
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="space-y-6">
          <div className="flex flex-col items-center space-y-4">
            <div className="h-24 w-24 bg-muted rounded-full animate-pulse" />
            <div className="space-y-2">
              <div className="h-6 w-32 bg-muted rounded animate-pulse" />
              <div className="h-4 w-48 bg-muted rounded animate-pulse" />
            </div>
            <div className="flex gap-2">
              <div className="h-6 w-16 bg-muted rounded animate-pulse" />
              <div className="h-6 w-20 bg-muted rounded animate-pulse" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!user) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Identity & Roles</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-center text-muted-foreground">
            Laden des Profils fehlgeschlagen.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="space-y-6">
        {/* Avatar and basic info */}
        <div className="flex flex-col items-center space-y-4">
          <Avatar className="h-24 w-24">
            <AvatarImage src={user.image || "/placeholder.svg"} />
            <AvatarFallback className="text-lg">
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>

          <div className="text-center">
            <h3 className="text-xl font-semibold">{user.name || "No Name"}</h3>
            <p className="text-muted-foreground">{user.email}</p>
          </div>

          {/* Role badges */}
          <div className="flex flex-wrap gap-2 justify-center">
            {user.roles.length > 0 ? (
              user.roles.map((role) => (
                <Badge key={role} variant="secondary">
                  {role}
                </Badge>
              ))
            ) : (
              <Badge variant="outline">Keine Rollen</Badge>
            )}
          </div>
        </div>

        {/* Action buttons */}
        <div className="space-y-2">
          <Dialog open={nameDialogOpen} onOpenChange={setNameDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full bg-transparent"
                disabled={isPending}
              >
                <Edit className="mr-2 h-4 w-4" />
                Name Bearbeiten
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Name Bearbeiten</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="name">Vollständiger Name</Label>
                  <Input
                    id="name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Geben Sie Ihren vollständigen Namen ein"
                    maxLength={255}
                  />
                </div>
                <Button
                  onClick={handleNameEdit}
                  className="w-full"
                  disabled={isPending || !newName.trim()}
                >
                  {isPending ? "Speichern..." : "Änderungen speichern"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="outline"
                className="w-full bg-transparent"
                disabled={isPending}
              >
                <Camera className="mr-2 h-4 w-4" />
                Bild ändern
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Profilbild ändern</DialogTitle>
              </DialogHeader>
              <Tabs defaultValue="url">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="url">URL</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="space-y-4">
                  <div className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center">
                    <Camera className="mx-auto h-12 w-12 text-muted-foreground" />
                    <p className="mt-2 text-sm text-muted-foreground">
                      File upload functionality would be implemented here
                    </p>
                    <p className="text-xs text-muted-foreground">
                      (Use URL tab for now)
                    </p>
                  </div>
                </TabsContent>
                <TabsContent value="url" className="space-y-4">
                  <div>
                    <Label htmlFor="avatar-url">Image URL</Label>
                    <Input
                      id="avatar-url"
                      placeholder="https://example.com/avatar.jpg"
                      value={newAvatarUrl}
                      onChange={(e) => setNewAvatarUrl(e.target.value)}
                    />
                  </div>
                  {newAvatarUrl && (
                    <div className="flex justify-center">
                      <Avatar className="h-16 w-16">
                        <AvatarImage src={newAvatarUrl || "/placeholder.svg"} />
                        <AvatarFallback>Preview</AvatarFallback>
                      </Avatar>
                    </div>
                  )}
                  <Button
                    onClick={handleAvatarChange}
                    className="w-full"
                    disabled={isPending || !newAvatarUrl.trim()}
                  >
                    {isPending ? "Speichert..." : "Bild speichern"}
                  </Button>
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={handleSync}
            disabled={isPending}
          >
            <Sync className="mr-2 h-4 w-4" />
            {isPending ? "Synchronisiere..." : "Microsoft Sync"}
          </Button>

          <Button
            variant="outline"
            className="w-full bg-transparent"
            onClick={handleRefresh}
            disabled={isPending}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            {isPending ? "Aktualisiere..." : "Aktualisieren"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
