import { Loader2, Mail, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createUser } from "../../server/actions/newuser/users";
import { Button } from "../ui/button";
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
import type { UserWithRoles } from "./dashboard";

interface AddUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserCreated: (user: Omit<UserWithRoles, "roles">) => void;
}

export function AddUserDialog({
  open,
  onOpenChange,
  onUserCreated,
}: AddUserDialogProps) {
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const handleClose = () => {
    onOpenChange(false);
    setEmail("");
    setName("");
  };

  const handleCreate = () => {
    if (!email.trim()) {
      toast.error("Fehler", {
        description: "Bitte geben Sie eine E-Mail-Adresse ein.",
      });
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      toast.error("Fehler", {
        description: "Bitte geben Sie eine gültige E-Mail-Adresse ein.",
      });
      return;
    }

    startTransition(async () => {
      try {
        const result = await createUser({
          email: email.trim(),
          name: name.trim() || null,
        });

        if (result.success && result.user) {
          onUserCreated(result.user);
          handleClose();
          toast.success("Benutzer erstellt", {
            description: `Registrierungslink wurde an ${email} gesendet.`,
          });
        } else {
          toast.error("Fehler", {
            description: result.error || "Benutzer konnte nicht erstellt werden.",
          });
        }
      } catch {
        toast.error("Fehler", {
          description: "Ein unerwarteter Fehler ist aufgetreten.",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
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
                value={email}
                onChange={(e) => setEmail(e.target.value)}
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
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isPending}
            />
          </div>
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Abbrechen
          </Button>
          <Button
            onClick={handleCreate}
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
  );
}
