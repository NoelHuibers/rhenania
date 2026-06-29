"use client";

import { Contact } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { MemberStatusBadge } from "~/components/members/MemberStatusBadge";
import {
	avatarColorClasses,
	memberInitials,
} from "~/components/members/member-constants";
import { Avatar, AvatarFallback } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";
import { cn } from "~/lib/utils";
import { getMyMember, updateMyMember } from "~/server/actions/members/myMember";
import type { Member } from "~/server/db/schema";

const emptyForm = {
	firstName: "",
	lastName: "",
	title: "",
	email: "",
	email2: "",
	email3: "",
	mobile: "",
	phonePrivate: "",
	phonePrivate2: "",
	phoneWork: "",
	phoneWork2: "",
	company: "",
	birthday: "",
	street: "",
	houseNumber: "",
	addressLine2: "",
	postalCode: "",
	city: "",
	country: "Deutschland",
	forwarding: false,
	lettersOptOut: false,
	notes: "",
};

type Form = typeof emptyForm;

function TF({
	id,
	label,
	value,
	onChange,
	disabled,
	placeholder,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	disabled: boolean;
	placeholder?: string;
}) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				disabled={disabled}
				placeholder={placeholder}
			/>
		</div>
	);
}

export function MemberAddressCard() {
	const [member, setMember] = useState<Member | null>(null);
	const [loaded, setLoaded] = useState(false);
	const [f, setF] = useState<Form>(emptyForm);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		(async () => {
			const m = await getMyMember();
			if (m) {
				setMember(m);
				setF({
					firstName: m.firstName ?? "",
					lastName: m.lastName ?? "",
					title: m.title ?? "",
					email: m.email ?? "",
					email2: m.email2 ?? "",
					email3: m.email3 ?? "",
					mobile: m.mobile ?? "",
					phonePrivate: m.phonePrivate ?? "",
					phonePrivate2: m.phonePrivate2 ?? "",
					phoneWork: m.phoneWork ?? "",
					phoneWork2: m.phoneWork2 ?? "",
					company: m.company ?? "",
					birthday: m.birthday ?? "",
					street: m.street ?? "",
					houseNumber: m.houseNumber ?? "",
					addressLine2: m.addressLine2 ?? "",
					postalCode: m.postalCode ?? "",
					city: m.city ?? "",
					country: m.country ?? "Deutschland",
					forwarding: m.forwarding,
					lettersOptOut: m.lettersOptOut,
					notes: m.notes ?? "",
				});
			}
			setLoaded(true);
		})();
	}, []);

	const disabled = !loaded || !member || isPending;
	const set = (k: keyof Form, v: string | boolean) =>
		setF((prev) => ({ ...prev, [k]: v }));

	const save = () => {
		if (!f.firstName.trim() || !f.lastName.trim()) {
			toast.error("Vor- und Nachname erforderlich");
			return;
		}
		startTransition(async () => {
			const res = await updateMyMember(f);
			if (res.success) toast.success("Daten gespeichert");
			else toast.error(res.error);
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Contact className="h-5 w-5" />
					Mein Eintrag
				</CardTitle>
			</CardHeader>
			<CardContent>
				{loaded && !member ? (
					<p className="text-muted-foreground text-sm">
						Du bist noch nicht im Mitgliederverzeichnis erfasst — wende dich an
						den Senior.
					</p>
				) : (
					<div className="space-y-5">
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
									{[f.lastName, f.firstName].filter(Boolean).join(", ") || "—"}
								</div>
								<div className="mt-1 flex flex-wrap items-center gap-2">
									<MemberStatusBadge status={member?.status ?? "—"} />
									<span className="text-muted-foreground text-xs">
										Status nur durch den Vorstand änderbar
									</span>
								</div>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<TF
								id="ma-last"
								label="Nachname"
								value={f.lastName}
								onChange={(v) => set("lastName", v)}
								disabled={disabled}
							/>
							<TF
								id="ma-first"
								label="Vorname"
								value={f.firstName}
								onChange={(v) => set("firstName", v)}
								disabled={disabled}
							/>
							<TF
								id="ma-title"
								label="Position / Titel"
								value={f.title}
								onChange={(v) => set("title", v)}
								disabled={disabled}
							/>
						</div>

						<div className="space-y-3">
							<p className="font-medium text-muted-foreground text-xs uppercase">
								Kontakt
							</p>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<TF
									id="ma-email"
									label="E-Mail"
									value={f.email}
									onChange={(v) => set("email", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-email2"
									label="E-Mail 2"
									value={f.email2}
									onChange={(v) => set("email2", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-email3"
									label="E-Mail 3"
									value={f.email3}
									onChange={(v) => set("email3", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-mobile"
									label="Mobil"
									value={f.mobile}
									onChange={(v) => set("mobile", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-telp"
									label="Tel. privat"
									value={f.phonePrivate}
									onChange={(v) => set("phonePrivate", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-telp2"
									label="Tel. privat 2"
									value={f.phonePrivate2}
									onChange={(v) => set("phonePrivate2", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-telw"
									label="Tel. geschäftlich"
									value={f.phoneWork}
									onChange={(v) => set("phoneWork", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-telw2"
									label="Tel. geschäftlich 2"
									value={f.phoneWork2}
									onChange={(v) => set("phoneWork2", v)}
									disabled={disabled}
								/>
							</div>
						</div>

						<div className="space-y-3">
							<p className="font-medium text-muted-foreground text-xs uppercase">
								Adresse
							</p>
							<div className="grid grid-cols-[1fr_90px] gap-3">
								<TF
									id="ma-street"
									label="Straße"
									value={f.street}
									onChange={(v) => set("street", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-house"
									label="Nr."
									value={f.houseNumber}
									onChange={(v) => set("houseNumber", v)}
									disabled={disabled}
								/>
							</div>
							<TF
								id="ma-line2"
								label="Adresszusatz"
								value={f.addressLine2}
								onChange={(v) => set("addressLine2", v)}
								disabled={disabled}
								placeholder="c/o, Wohnung…"
							/>
							<div className="grid grid-cols-[90px_1fr] gap-3">
								<TF
									id="ma-plz"
									label="PLZ"
									value={f.postalCode}
									onChange={(v) => set("postalCode", v)}
									disabled={disabled}
								/>
								<TF
									id="ma-city"
									label="Ort"
									value={f.city}
									onChange={(v) => set("city", v)}
									disabled={disabled}
								/>
							</div>
							<TF
								id="ma-country"
								label="Land"
								value={f.country}
								onChange={(v) => set("country", v)}
								disabled={disabled}
							/>
						</div>

						<div className="space-y-3">
							<p className="font-medium text-muted-foreground text-xs uppercase">
								Sonstiges
							</p>
							<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
								<TF
									id="ma-bday"
									label="Geburtstag"
									value={f.birthday}
									onChange={(v) => set("birthday", v)}
									disabled={disabled}
									placeholder="TT.MM.JJJJ"
								/>
								<TF
									id="ma-company"
									label="Firma"
									value={f.company}
									onChange={(v) => set("company", v)}
									disabled={disabled}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="ma-notes">Notizen</Label>
								<Textarea
									id="ma-notes"
									value={f.notes}
									onChange={(e) => set("notes", e.target.value)}
									disabled={disabled}
									rows={2}
								/>
							</div>
							<div className="flex flex-wrap gap-4">
								<div className="flex items-center gap-2">
									<Checkbox
										id="ma-opt"
										checked={f.lettersOptOut}
										onCheckedChange={(c) => set("lettersOptOut", c === true)}
										disabled={disabled}
									/>
									<Label htmlFor="ma-opt" className="font-normal">
										Nur E-Mail, keine Briefe
									</Label>
								</div>
								<div className="flex items-center gap-2">
									<Checkbox
										id="ma-fwd"
										checked={f.forwarding}
										onCheckedChange={(c) => set("forwarding", c === true)}
										disabled={disabled}
									/>
									<Label htmlFor="ma-fwd" className="font-normal">
										Weiterleitung
									</Label>
								</div>
							</div>
						</div>

						<Button onClick={save} disabled={disabled} className="w-full">
							Speichern
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
