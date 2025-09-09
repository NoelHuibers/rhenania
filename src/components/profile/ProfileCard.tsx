"use client";

import { upload } from "@vercel/blob/client";
import {
  Camera,
  Edit,
  RefreshCw,
  FolderSyncIcon as Sync,
  Upload,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
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
  deleteUserAvatar,
  updateUserAvatarUrl,
} from "~/server/actions/profile/avatar";
import {
  getUserProfile,
  refreshProfile,
  syncFromMicrosoft,
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
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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

  // Cleanup preview URL when component unmounts or file changes
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

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

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (!allowedTypes.includes(file.type)) {
      toast.error("Ungültiger Dateityp. Erlaubt sind: JPEG, PNG, WebP");
      return;
    }

    // Validate file size (5MB max)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast.error("Datei ist zu groß. Maximum: 5MB");
      return;
    }

    setSelectedFile(file);

    // Create preview URL
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    const newPreviewUrl = URL.createObjectURL(file);
    setPreviewUrl(newPreviewUrl);
  };

  const handleFileUpload = async () => {
    if (!selectedFile) {
      toast.error("Keine Datei ausgewählt");
      return;
    }

    setUploadingFile(true);
    try {
      // Upload file to Vercel Blob
      const blob = await upload(`profile/${selectedFile.name}`, selectedFile, {
        access: "public",
        handleUploadUrl: "/api/upload",
        clientPayload: `profile/${user?.id}/${selectedFile.name}`,
      });

      // Update user avatar URL in database
      const formData = new FormData();
      formData.append("imageUrl", blob.url);

      const result = await updateUserAvatarUrl(formData);

      if (result.success) {
        toast.success("Profilbild erfolgreich hochgeladen");
        setAvatarDialogOpen(false);

        // Update local state
        if (user) {
          setUser({ ...user, image: blob.url });
        }

        // Reset file selection
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        toast.error(result.message || "Upload fehlgeschlagen");
      }
    } catch (error) {
      console.error("Upload error:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Hochladen des Bildes"
      );
    } finally {
      setUploadingFile(false);
    }
  };

  const handleAvatarUrlChange = () => {
    if (!newAvatarUrl.trim()) {
      toast.error("Image URL cannot be empty.");
      return;
    }

    startTransition(async () => {
      try {
        const formData = new FormData();
        formData.append("imageUrl", newAvatarUrl.trim());

        const result = await updateUserAvatarUrl(formData);

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

  const handleDeleteAvatar = () => {
    startTransition(async () => {
      try {
        const result = await deleteUserAvatar();

        if (result.success) {
          toast.success(result.message);
          // Update local state
          if (user) {
            setUser({ ...user, image: null });
          }
        }
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : "Fehler beim Löschen des Profilbilds"
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
          <div className="relative group">
            <Avatar className="h-24 w-24">
              <AvatarImage src={user.image || "/placeholder.svg"} />
              <AvatarFallback className="text-lg">
                {getInitials(user.name)}
              </AvatarFallback>
            </Avatar>
            {user.image && (
              <Button
                size="icon"
                variant="destructive"
                className="absolute -top-2 -right-2 h-6 w-6 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={handleDeleteAvatar}
                disabled={isPending}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>

          <div className="text-center">
            <h3 className="text-xl font-semibold">{user.name || "No Name"}</h3>
            <p className="text-muted-foreground">{user.email || "No Email"}</p>
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
                  <Label htmlFor="name" className="pb-2">
                    Vollständiger Name
                  </Label>
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

          <Dialog
            open={avatarDialogOpen}
            onOpenChange={(open) => {
              setAvatarDialogOpen(open);
              // Reset states when dialog closes
              if (!open) {
                setSelectedFile(null);
                setPreviewUrl(null);
                setNewAvatarUrl("");
                if (fileInputRef.current) {
                  fileInputRef.current.value = "";
                }
              }
            }}
          >
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
              <Tabs defaultValue="upload">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="upload">Upload</TabsTrigger>
                  <TabsTrigger value="url">URL</TabsTrigger>
                </TabsList>
                <TabsContent value="upload" className="space-y-4">
                  <div className="space-y-4">
                    <div
                      className="border-2 border-dashed border-muted-foreground/25 rounded-lg p-6 text-center cursor-pointer hover:border-muted-foreground/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/jpeg,image/jpg,image/png,image/webp"
                        onChange={handleFileSelect}
                        className="hidden"
                      />

                      {previewUrl ? (
                        <div className="space-y-3">
                          <Avatar className="h-20 w-20 mx-auto">
                            <AvatarImage src={previewUrl} />
                            <AvatarFallback>Preview</AvatarFallback>
                          </Avatar>
                          <p className="text-sm text-muted-foreground">
                            {selectedFile?.name}
                          </p>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedFile(null);
                              setPreviewUrl(null);
                              if (fileInputRef.current) {
                                fileInputRef.current.value = "";
                              }
                            }}
                          >
                            Andere Datei wählen
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                          <p className="mt-2 text-sm text-muted-foreground">
                            Klicken Sie hier oder ziehen Sie eine Datei herein
                          </p>
                          <p className="text-xs text-muted-foreground">
                            JPEG, PNG oder WebP (max. 5MB)
                          </p>
                        </>
                      )}
                    </div>

                    {selectedFile && (
                      <Button
                        onClick={handleFileUpload}
                        className="w-full"
                        disabled={uploadingFile}
                      >
                        {uploadingFile ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Wird hochgeladen...
                          </>
                        ) : (
                          <>
                            <Upload className="mr-2 h-4 w-4" />
                            Bild hochladen
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </TabsContent>
                <TabsContent value="url" className="space-y-4">
                  <div>
                    <Label htmlFor="avatar-url" className="pb-2">
                      Image URL
                    </Label>
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
                    onClick={handleAvatarUrlChange}
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
