"use client";

import { Search } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkSetRoleUsers } from "../../server/actions/admin/admin";
import { Avatar, AvatarFallback, AvatarImage } from "../ui/avatar";
import { Button } from "../ui/button";
import { Checkbox } from "../ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "../ui/dialog";
import { Input } from "../ui/input";
import {
	type Role,
	SINGLE_PERSON_ROLES,
	type UserWithRoles,
} from "./dashboard";

const getInitials = (name: string | null) => {
	if (!name) return "??";
	return name
		.split(" ")
		.map((part) => part[0])
		.join("")
		.toUpperCase()
		.substring(0, 2);
};

interface BulkRoleDialogProps {
	role: Role | null;
	users: UserWithRoles[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onSaved: (roleId: string, userIds: string[]) => void;
}

export function BulkRoleDialog({
	role,
	users,
	open,
	onOpenChange,
	onSaved,
}: BulkRoleDialogProps) {
	const [search, setSearch] = useState("");
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (open && role) {
			setSelected(
				new Set(
					users
						.filter((u) => u.roles.some((r) => r.id === role.id))
						.map((u) => u.id),
				),
			);
			setSearch("");
		}
	}, [open, role, users]);

	const toggle = (userId: string) => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(userId)) next.delete(userId);
			else next.add(userId);
			return next;
		});
	};

	const filteredUsers = users.filter(
		(u) =>
			u.name?.toLowerCase().includes(search.toLowerCase()) ||
			u.email?.toLowerCase().includes(search.toLowerCase()),
	);

	const allFilteredSelected = filteredUsers.every((u) => selected.has(u.id));

	const toggleAll = () => {
		setSelected((prev) => {
			const next = new Set(prev);
			if (allFilteredSelected) {
				for (const u of filteredUsers) next.delete(u.id);
			} else {
				for (const u of filteredUsers) next.add(u.id);
			}
			return next;
		});
	};

	const save = () => {
		if (!role) return;
		startTransition(async () => {
			try {
				const userIds = [...selected];
				await bulkSetRoleUsers(role.id, userIds);
				onSaved(role.id, userIds);
				toast.success("Rolle aktualisiert");
				onOpenChange(false);
			} catch {
				toast.error("Fehler beim Speichern");
			}
		});
	};

	if (!role) return null;

	const isSinglePerson = SINGLE_PERSON_ROLES.includes(
		role.name as (typeof SINGLE_PERSON_ROLES)[number],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[80vh] flex-col sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{role.name}</DialogTitle>
					{isSinglePerson && (
						<p className="text-muted-foreground text-xs">
							Nur 1 Person sollte diese Rolle haben.
						</p>
					)}
				</DialogHeader>

				<div className="flex flex-1 flex-col space-y-3 min-h-0">
					<div className="relative">
						<Search className="absolute top-2.5 left-2.5 h-4 w-4 text-muted-foreground" />
						<Input
							placeholder="Suchen..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="pl-9"
						/>
					</div>

					<div className="flex items-center justify-between px-1">
						<span className="text-muted-foreground text-xs">
							{selected.size} ausgewählt
						</span>
						<button
							type="button"
							onClick={toggleAll}
							className="cursor-pointer text-primary text-xs hover:underline"
						>
							{allFilteredSelected ? "Alle abwählen" : "Alle auswählen"}
						</button>
					</div>

					<div className="flex-1 space-y-1 overflow-y-auto">
						{filteredUsers.map((user) => (
							<label
								key={user.id}
								htmlFor={`bulk-user-${user.id}`}
								className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-muted"
							>
								<Checkbox
									id={`bulk-user-${user.id}`}
									checked={selected.has(user.id)}
									onCheckedChange={() => toggle(user.id)}
								/>
								<Avatar className="h-7 w-7 shrink-0">
									<AvatarImage
										src={user.image || undefined}
										alt={user.name || ""}
									/>
									<AvatarFallback className="text-xs">
										{getInitials(user.name)}
									</AvatarFallback>
								</Avatar>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm">{user.name}</p>
								</div>
							</label>
						))}
						{filteredUsers.length === 0 && (
							<p className="py-4 text-center text-muted-foreground text-sm">
								Keine Benutzer gefunden
							</p>
						)}
					</div>
				</div>

				<DialogFooter>
					<Button
						variant="outline"
						onClick={() => onOpenChange(false)}
						disabled={isPending}
					>
						Abbrechen
					</Button>
					<Button onClick={save} disabled={isPending}>
						Speichern
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
