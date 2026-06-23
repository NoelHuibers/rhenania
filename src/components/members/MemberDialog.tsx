"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Textarea } from "~/components/ui/textarea";
import {
	createMember,
	type MemberListItem,
	updateMember,
} from "~/server/actions/members/members";
import {
	MEMBER_STATUS_OPTIONS,
	type MemberStatusValue,
} from "./member-constants";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	member?: MemberListItem | null;
	onSaved: () => void;
};

const empty = {
	status: "CB",
	firstName: "",
	lastName: "",
	email: "",
	street: "",
	houseNumber: "",
	addressLine2: "",
	postalCode: "",
	city: "",
	country: "Deutschland",
	lettersOptOut: false,
	addressNeedsUpdate: false,
	notes: "",
};

export function MemberDialog({ open, onOpenChange, member, onSaved }: Props) {
	const isEdit = !!member;
	const [f, setF] = useState(empty);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) return;
		if (member) {
			setF({
				status: member.status,
				firstName: member.firstName,
				lastName: member.lastName,
				email: member.email ?? "",
				street: member.street ?? "",
				houseNumber: member.houseNumber ?? "",
				addressLine2: member.addressLine2 ?? "",
				postalCode: member.postalCode ?? "",
				city: member.city ?? "",
				country: member.country ?? "Deutschland",
				lettersOptOut: member.lettersOptOut,
				addressNeedsUpdate: member.addressNeedsUpdate,
				notes: member.notes ?? "",
			});
		} else {
			setF(empty);
		}
	}, [open, member]);

	const set = (k: keyof typeof empty, v: string | boolean) =>
		setF((prev) => ({ ...prev, [k]: v }));

	const save = () => {
		if (!f.firstName.trim() || !f.lastName.trim()) {
			toast.error("Vor- und Nachname erforderlich");
			return;
		}
		startTransition(async () => {
			const payload = { ...f, status: f.status as MemberStatusValue };
			const res = member
				? await updateMember(member.id, payload)
				: await createMember(payload);
			if (res.success) {
				toast.success(isEdit ? "Mitglied gespeichert" : "Mitglied erstellt");
				onSaved();
				onOpenChange(false);
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[560px]">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Mitglied bearbeiten" : "Neues Mitglied"}
					</DialogTitle>
				</DialogHeader>

				<div className="flex-1 space-y-4 overflow-y-auto px-1 py-2">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div className="grid gap-2">
							<Label htmlFor="m-last">Nachname</Label>
							<Input
								id="m-last"
								value={f.lastName}
								onChange={(e) => set("lastName", e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="m-first">Vorname</Label>
							<Input
								id="m-first"
								value={f.firstName}
								onChange={(e) => set("firstName", e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="m-status">Status</Label>
							<Select value={f.status} onValueChange={(v) => set("status", v)}>
								<SelectTrigger id="m-status">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{MEMBER_STATUS_OPTIONS.map((o) => (
										<SelectItem key={o.value} value={o.value}>
											{o.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="m-email">Email</Label>
							<Input
								id="m-email"
								value={f.email}
								onChange={(e) => set("email", e.target.value)}
								placeholder="optional"
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
						<div className="grid gap-2">
							<Label htmlFor="m-street">Straße</Label>
							<Input
								id="m-street"
								value={f.street}
								onChange={(e) => set("street", e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="m-house">Hausnr.</Label>
							<Input
								id="m-house"
								value={f.houseNumber}
								onChange={(e) => set("houseNumber", e.target.value)}
							/>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="m-line2">Adresszusatz (optional)</Label>
						<Input
							id="m-line2"
							value={f.addressLine2}
							onChange={(e) => set("addressLine2", e.target.value)}
							placeholder="c/o, Wohnung…"
						/>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_1fr]">
						<div className="grid gap-2">
							<Label htmlFor="m-plz">PLZ</Label>
							<Input
								id="m-plz"
								value={f.postalCode}
								onChange={(e) => set("postalCode", e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="m-city">Ort</Label>
							<Input
								id="m-city"
								value={f.city}
								onChange={(e) => set("city", e.target.value)}
							/>
						</div>
						<div className="grid gap-2">
							<Label htmlFor="m-country">Land</Label>
							<Input
								id="m-country"
								value={f.country}
								onChange={(e) => set("country", e.target.value)}
							/>
						</div>
					</div>

					<div className="space-y-2">
						<div className="flex items-center gap-2">
							<Checkbox
								id="m-opt"
								checked={f.lettersOptOut}
								onCheckedChange={(c) => set("lettersOptOut", c === true)}
							/>
							<Label htmlFor="m-opt" className="font-normal">
								Nur Email, keine Briefe
							</Label>
						</div>
						<div className="flex items-center gap-2">
							<Checkbox
								id="m-veraltet"
								checked={f.addressNeedsUpdate}
								onCheckedChange={(c) => set("addressNeedsUpdate", c === true)}
							/>
							<Label htmlFor="m-veraltet" className="font-normal">
								Adresse veraltet
							</Label>
						</div>
					</div>

					<div className="grid gap-2">
						<Label htmlFor="m-notes">Notizen (optional)</Label>
						<Textarea
							id="m-notes"
							value={f.notes}
							onChange={(e) => set("notes", e.target.value)}
							rows={2}
						/>
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
						{isEdit ? "Speichern" : "Erstellen"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
