"use client";

import { Checkbox } from "~/components/ui/checkbox";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Textarea } from "~/components/ui/textarea";

/** Initial values of the member form (blank for a new member). */
export const emptyMemberForm = {
	status: "CB",
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
	street: "",
	houseNumber: "",
	addressLine2: "",
	postalCode: "",
	city: "",
	country: "Deutschland",
	birthday: "",
	company: "",
	notes: "",
	forwarding: false,
	lettersOptOut: false,
	addressNeedsUpdate: false,
};

export type MemberForm = typeof emptyMemberForm;

function TF({
	id,
	label,
	value,
	onChange,
	list,
	placeholder,
}: {
	id: string;
	label: string;
	value: string;
	onChange: (v: string) => void;
	list?: string;
	placeholder?: string;
}) {
	return (
		<div className="grid gap-1.5">
			<Label htmlFor={id}>{label}</Label>
			<Input
				id={id}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				list={list}
				placeholder={placeholder}
			/>
		</div>
	);
}

/** All editable fields of the member dialog, grouped by section. */
export function MemberFormFields({
	f,
	set,
	statusOptions,
}: {
	f: MemberForm;
	set: (k: keyof MemberForm, v: string | boolean) => void;
	statusOptions: { value: string; label: string }[];
}) {
	return (
		<div className="flex-1 space-y-5 overflow-y-auto px-1 py-2">
			<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
				<TF
					id="m-last"
					label="Nachname"
					value={f.lastName}
					onChange={(v) => set("lastName", v)}
				/>
				<TF
					id="m-first"
					label="Vorname"
					value={f.firstName}
					onChange={(v) => set("firstName", v)}
				/>
				<TF
					id="m-status"
					label="Abteilung"
					value={f.status}
					onChange={(v) => set("status", v)}
					list="member-status-options"
					placeholder={statusOptions.map((o) => o.value).join(" / ")}
				/>
				<datalist id="member-status-options">
					{statusOptions.map((o) => (
						<option key={o.value} value={o.value} />
					))}
				</datalist>
				<TF
					id="m-title"
					label="Position / Titel"
					value={f.title}
					onChange={(v) => set("title", v)}
					placeholder="z.B. Dr.-Ing."
				/>
			</div>

			<div className="space-y-3">
				<p className="font-medium text-muted-foreground text-xs uppercase">
					Kontakt
				</p>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<TF
						id="m-email"
						label="E-Mail"
						value={f.email}
						onChange={(v) => set("email", v)}
					/>
					<TF
						id="m-email2"
						label="E-Mail 2"
						value={f.email2}
						onChange={(v) => set("email2", v)}
					/>
					<TF
						id="m-email3"
						label="E-Mail 3"
						value={f.email3}
						onChange={(v) => set("email3", v)}
					/>
					<TF
						id="m-mobile"
						label="Mobil"
						value={f.mobile}
						onChange={(v) => set("mobile", v)}
					/>
					<TF
						id="m-telp"
						label="Tel. privat"
						value={f.phonePrivate}
						onChange={(v) => set("phonePrivate", v)}
					/>
					<TF
						id="m-telp2"
						label="Tel. privat 2"
						value={f.phonePrivate2}
						onChange={(v) => set("phonePrivate2", v)}
					/>
					<TF
						id="m-telw"
						label="Tel. geschäftlich"
						value={f.phoneWork}
						onChange={(v) => set("phoneWork", v)}
					/>
					<TF
						id="m-telw2"
						label="Tel. geschäftlich 2"
						value={f.phoneWork2}
						onChange={(v) => set("phoneWork2", v)}
					/>
				</div>
			</div>

			<div className="space-y-3">
				<p className="font-medium text-muted-foreground text-xs uppercase">
					Adresse
				</p>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
					<TF
						id="m-street"
						label="Straße"
						value={f.street}
						onChange={(v) => set("street", v)}
					/>
					<TF
						id="m-house"
						label="Hausnr."
						value={f.houseNumber}
						onChange={(v) => set("houseNumber", v)}
					/>
				</div>
				<TF
					id="m-line2"
					label="Adresszusatz"
					value={f.addressLine2}
					onChange={(v) => set("addressLine2", v)}
					placeholder="c/o, Wohnung…"
				/>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-[120px_1fr_1fr]">
					<TF
						id="m-plz"
						label="PLZ"
						value={f.postalCode}
						onChange={(v) => set("postalCode", v)}
					/>
					<TF
						id="m-city"
						label="Ort"
						value={f.city}
						onChange={(v) => set("city", v)}
					/>
					<TF
						id="m-country"
						label="Land"
						value={f.country}
						onChange={(v) => set("country", v)}
					/>
				</div>
			</div>

			<div className="space-y-3">
				<p className="font-medium text-muted-foreground text-xs uppercase">
					Sonstiges
				</p>
				<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
					<TF
						id="m-bday"
						label="Geburtstag"
						value={f.birthday}
						onChange={(v) => set("birthday", v)}
						placeholder="TT.MM.JJJJ"
					/>
					<TF
						id="m-firma"
						label="Firma"
						value={f.company}
						onChange={(v) => set("company", v)}
					/>
				</div>
				<div className="grid gap-1.5">
					<Label htmlFor="m-notes">Notizen</Label>
					<Textarea
						id="m-notes"
						value={f.notes}
						onChange={(e) => set("notes", e.target.value)}
						rows={2}
					/>
				</div>
				<div className="flex flex-wrap gap-4">
					<div className="flex items-center gap-2 text-sm">
						<Checkbox
							id="m-opt"
							checked={f.lettersOptOut}
							onCheckedChange={(c) => set("lettersOptOut", c === true)}
						/>
						<Label htmlFor="m-opt" className="font-normal">
							Nur Email, keine Briefe
						</Label>
					</div>
					<div className="flex items-center gap-2 text-sm">
						<Checkbox
							id="m-veraltet"
							checked={f.addressNeedsUpdate}
							onCheckedChange={(c) => set("addressNeedsUpdate", c === true)}
						/>
						<Label htmlFor="m-veraltet" className="font-normal">
							Adresse veraltet
						</Label>
					</div>
					<div className="flex items-center gap-2 text-sm">
						<Checkbox
							id="m-fwd"
							checked={f.forwarding}
							onCheckedChange={(c) => set("forwarding", c === true)}
						/>
						<Label htmlFor="m-fwd" className="font-normal">
							Weiterleitung
						</Label>
					</div>
				</div>
			</div>
		</div>
	);
}
