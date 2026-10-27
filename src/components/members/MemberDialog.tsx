"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { cn } from "~/lib/utils";
import {
	createMember,
	type MemberListItem,
	updateMember,
} from "~/server/actions/members/members";
import {
	emptyMemberForm,
	type MemberForm,
	MemberFormFields,
} from "./MemberFormFields";
import { MemberStatusBadge } from "./MemberStatusBadge";
import {
	avatarColorClasses,
	MEMBER_STATUS_OPTIONS,
	memberInitials,
} from "./member-constants";

type Props = {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	member?: MemberListItem | null;
	onSaved: () => void;
	statusOptions?: { value: string; label: string }[];
};

export function MemberDialog({
	open,
	onOpenChange,
	member,
	onSaved,
	statusOptions = MEMBER_STATUS_OPTIONS,
}: Props) {
	const isEdit = !!member;
	const [f, setF] = useState<MemberForm>(emptyMemberForm);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!open) {
			return;
		}
		if (member) {
			setF({
				status: member.status,
				firstName: member.firstName,
				lastName: member.lastName,
				title: member.title ?? "",
				email: member.email ?? "",
				email2: member.email2 ?? "",
				email3: member.email3 ?? "",
				mobile: member.mobile ?? "",
				phonePrivate: member.phonePrivate ?? "",
				phonePrivate2: member.phonePrivate2 ?? "",
				phoneWork: member.phoneWork ?? "",
				phoneWork2: member.phoneWork2 ?? "",
				street: member.street ?? "",
				houseNumber: member.houseNumber ?? "",
				addressLine2: member.addressLine2 ?? "",
				postalCode: member.postalCode ?? "",
				city: member.city ?? "",
				country: member.country ?? "Deutschland",
				birthday: member.birthday ?? "",
				company: member.company ?? "",
				notes: member.notes ?? "",
				forwarding: member.forwarding,
				lettersOptOut: member.lettersOptOut,
				addressNeedsUpdate: member.addressNeedsUpdate,
			});
		} else {
			setF(emptyMemberForm);
		}
	}, [open, member]);

	const set = (k: keyof MemberForm, v: string | boolean) =>
		setF((prev) => ({ ...prev, [k]: v }));

	const save = () => {
		if (!f.firstName.trim() || !f.lastName.trim()) {
			toast.error("Vor- und Nachname erforderlich");
			return;
		}
		if (!f.status.trim()) {
			toast.error("Abteilung erforderlich");
			return;
		}
		startTransition(async () => {
			const res = member
				? await updateMember(member.id, f)
				: await createMember(f);
			if (res.success) {
				toast.success(isEdit ? "Mitglied gespeichert" : "Mitglied erstellt");
				if (res.linkedNow) {
					toast.success("E-Mail passt zu einem App-Account — verknüpft.");
				}
				onSaved();
				onOpenChange(false);
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="flex max-h-[90vh] flex-col sm:max-w-[640px]">
				<DialogHeader>
					<DialogTitle>
						{isEdit ? "Mitglied bearbeiten" : "Neues Mitglied"}
					</DialogTitle>
				</DialogHeader>

				{(f.firstName || f.lastName) && (
					<div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
						<Avatar size="lg" className="shrink-0">
							<AvatarFallback
								className={cn(
									"font-semibold text-sm",
									avatarColorClasses(f.lastName + f.firstName),
								)}
							>
								{memberInitials(f.firstName, f.lastName)}
							</AvatarFallback>
						</Avatar>
						<div className="min-w-0">
							<div className="truncate font-medium">
								{[f.lastName, f.firstName].filter(Boolean).join(", ")}
							</div>
							{f.status && (
								<div className="mt-1">
									<MemberStatusBadge status={f.status} />
								</div>
							)}
						</div>
					</div>
				)}

				<MemberFormFields f={f} set={set} statusOptions={statusOptions} />

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
