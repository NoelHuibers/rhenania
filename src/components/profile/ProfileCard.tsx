"use client";

import { Edit, RefreshCw, FolderSyncIcon as Sync } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
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
import {
	getUserProfile,
	refreshProfile,
	syncFromMicrosoft,
	updateUserName,
} from "~/server/modules/profile/actions";
import { ProfileAvatarDialog } from "./ProfileAvatarDialog";

interface User {
	id: string;
	name: string | null;
	email: string | null;
	image: string | null;
	roles: string[];
}

/** Placeholder while the profile streams in. */
export function ProfileIdentitySkeleton() {
	return (
		<Card>
			<CardContent className="space-y-6">
				<div className="flex flex-col items-center space-y-4">
					<div className="h-24 w-24 animate-pulse rounded-full bg-muted" />
					<div className="space-y-2">
						<div className="h-6 w-32 animate-pulse rounded bg-muted" />
						<div className="h-4 w-48 animate-pulse rounded bg-muted" />
					</div>
					<div className="flex gap-2">
						<div className="h-6 w-16 animate-pulse rounded bg-muted" />
						<div className="h-6 w-20 animate-pulse rounded bg-muted" />
					</div>
				</div>
			</CardContent>
		</Card>
	);
}

/** Name, avatar and roles. `initial` comes from the server (#24); null if it failed. */
export function ProfileIdentity({ initial }: { initial: User | null }) {
	const [user, setUser] = useState<User | null>(initial);
	const [newName, setNewName] = useState(initial?.name ?? "");
	const [nameDialogOpen, setNameDialogOpen] = useState(false);
	const [isPending, startTransition] = useTransition();
	const router = useRouter();

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

				if (result.ok) {
					toast.success("Name aktualisiert");
					setNameDialogOpen(false);
					// Update local state
					if (user) {
						setUser({ ...user, name: newName.trim() });
					}
				} else {
					toast.error(result.error);
				}
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to update name",
				);
			}
		});
	};

	const handleSync = () => {
		startTransition(async () => {
			try {
				const result = await syncFromMicrosoft();

				if (result.ok) {
					toast.success(result.data.message);
					// Refetch user data after sync
					const userData = await getUserProfile();
					setUser(userData);
					setNewName(userData.name || "");
				} else {
					toast.error(result.error);
				}
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to sync from Microsoft",
				);
			}
		});
	};

	const handleRefresh = () => {
		startTransition(async () => {
			try {
				const result = await refreshProfile();

				if (result.ok) {
					toast.success("Profil aktualisiert");
					// Refetch user data after refresh
					const userData = await getUserProfile();
					setUser(userData);
					setNewName(userData.name || "");
					router.refresh(); // Refresh the page data
				} else {
					toast.error(result.error);
				}
			} catch (error) {
				toast.error(
					error instanceof Error ? error.message : "Failed to refresh profile",
				);
			}
		});
	};

	const getInitials = (name: string | null) => {
		if (!name) {
			return "U";
		}
		return name
			.split(" ")
			.map((n) => n[0])
			.join("")
			.toUpperCase();
	};

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
						<h3 className="font-semibold text-xl">{user.name || "No Name"}</h3>
						<p className="text-muted-foreground">{user.email || "No Email"}</p>
					</div>

					{/* Role badges */}
					<div className="flex flex-wrap justify-center gap-2">
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

					<ProfileAvatarDialog
						userId={user.id}
						currentImage={user.image}
						isPending={isPending}
						startTransition={startTransition}
						onImageChange={(image) => {
							if (user) {
								setUser({ ...user, image });
							}
						}}
					/>

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
