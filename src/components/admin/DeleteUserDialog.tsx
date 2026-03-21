import { Loader2, TriangleAlert } from "lucide-react";
import { useTransition } from "react";
import { toast } from "sonner";
import { deleteUser } from "../../server/actions/admin/admin";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import type { UserWithRoles } from "./dashboard";

interface DeleteUserDialogProps {
  user: UserWithRoles | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUserDeleted: (userId: string) => void;
}

export function DeleteUserDialog({
  user,
  open,
  onOpenChange,
  onUserDeleted,
}: DeleteUserDialogProps) {
  const [isPending, startTransition] = useTransition();

  if (!user) return null;

  const handleDelete = () => {
    startTransition(async () => {
      try {
        await deleteUser(user.id);
        onUserDeleted(user.id);
        onOpenChange(false);
        toast.success("Benutzer gelöscht", {
          description: `${user.name ?? user.email} wurde erfolgreich gelöscht.`,
        });
      } catch {
        toast.error("Fehler", {
          description: "Benutzer konnte nicht gelöscht werden.",
        });
      }
    });
  };

  return (
    <Dialog open={open} onOpenChange={(open) => { if (!isPending) onOpenChange(open); }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <TriangleAlert className="w-5 h-5" />
            Benutzer löschen
          </DialogTitle>
          <DialogDescription>
            Bist du sicher, dass du{" "}
            <span className="font-medium text-foreground">
              {user.name ?? user.email}
            </span>{" "}
            löschen möchtest? Diese Aktion kann nicht rückgängig gemacht werden.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          Alle Daten dieses Benutzers werden permanent gelöscht: Bestellungen,
          Rechnungen, Spielverlauf, Errungenschaften und Kontodaten.
        </div>

        <DialogFooter className="flex flex-col sm:flex-row gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            Abbrechen
          </Button>
          <Button
            variant="destructive"
            onClick={handleDelete}
            disabled={isPending}
            className="w-full sm:w-auto"
          >
            {isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Wird gelöscht...
              </>
            ) : (
              "Endgültig löschen"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
