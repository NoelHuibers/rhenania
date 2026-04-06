"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { updateUser } from "../../server/actions/admin/admin";
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

interface EditUserDialogProps {
	user: UserWithRoles | null;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onUserUpdated: (userId: string, name: string, email: string) => void;
}

export function EditUserDialog({
	user,
	open,
	onOpenChange,
	onUserUpdated,
}: EditUserDialogProps) {
	const [step, setStep] = useState<"edit" | "confirm">("edit");
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (open && user) {
			setName(user.name ?? "");
			setEmail(user.email ?? "");
			setStep("edit");
		}
	}, [open, user]);

	if (!user) return null;

	const handleOpenChange = (next: boolean) => {
		if (!isPending) onOpenChange(next);
	};

	const nameChanged = name.trim() !== (user.name ?? "");
	const emailChanged = email.trim() !== (user.email ?? "");
	const hasChanges = nameChanged || emailChanged;

	const handleConfirm = () => {
		startTransition(async () => {
			try {
				const data: { name?: string; email?: string } = {};
				if (nameChanged) data.name = name.trim();
				if (emailChanged) data.email = email.trim();
				await updateUser(user.id, data);
				onUserUpdated(user.id, name.trim(), email.trim());
				onOpenChange(false);
				toast.success("Benutzer aktualisiert");
			} catch {
				toast.error("Fehler beim Aktualisieren");
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={handleOpenChange}>
			<DialogContent className="sm:max-w-md">
				{step === "edit" ? (
					<>
						<DialogHeader>
							<DialogTitle>Benutzer bearbeiten</DialogTitle>
							<DialogDescription>
								Name oder E-Mail von{" "}
								<span className="font-medium text-foreground">
									{user.name ?? user.email}
								</span>{" "}
								ändern.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-4 py-2">
							<div className="space-y-1.5">
								<Label htmlFor="edit-name">Name</Label>
								<Input
									id="edit-name"
									value={name}
									onChange={(e) => setName(e.target.value)}
									placeholder="Name"
								/>
							</div>
							<div className="space-y-1.5">
								<Label htmlFor="edit-email">E-Mail</Label>
								<Input
									id="edit-email"
									type="email"
									value={email}
									onChange={(e) => setEmail(e.target.value)}
									placeholder="E-Mail"
								/>
							</div>
						</div>

						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => onOpenChange(false)}
								className="w-full sm:w-auto"
							>
								Abbrechen
							</Button>
							<Button
								onClick={() => setStep("confirm")}
								disabled={!hasChanges}
								className="w-full sm:w-auto"
							>
								Weiter
							</Button>
						</DialogFooter>
					</>
				) : (
					<>
						<DialogHeader>
							<DialogTitle>Änderungen bestätigen</DialogTitle>
							<DialogDescription>
								Bitte überprüfe die Änderungen für{" "}
								<span className="font-medium text-foreground">
									{user.name ?? user.email}
								</span>
								.
							</DialogDescription>
						</DialogHeader>

						<div className="space-y-2 rounded-md border p-3 text-sm">
							{nameChanged && (
								<div className="grid grid-cols-[5rem_1fr] gap-1">
									<span className="text-muted-foreground">Name</span>
									<span>
										<span className="text-muted-foreground line-through">
											{user.name}
										</span>
										{" → "}
										<span className="font-medium">{name.trim()}</span>
									</span>
								</div>
							)}
							{emailChanged && (
								<div className="grid grid-cols-[5rem_1fr] gap-1">
									<span className="text-muted-foreground">E-Mail</span>
									<span>
										<span className="text-muted-foreground line-through">
											{user.email}
										</span>
										{" → "}
										<span className="font-medium">{email.trim()}</span>
									</span>
								</div>
							)}
						</div>

						<DialogFooter className="flex flex-col gap-2 sm:flex-row">
							<Button
								variant="outline"
								onClick={() => setStep("edit")}
								disabled={isPending}
								className="w-full sm:w-auto"
							>
								Zurück
							</Button>
							<Button
								onClick={handleConfirm}
								disabled={isPending}
								className="w-full sm:w-auto"
							>
								{isPending ? (
									<>
										<Loader2 className="mr-2 h-4 w-4 animate-spin" />
										Wird gespeichert...
									</>
								) : (
									"Speichern"
								)}
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
