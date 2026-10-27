"use client";

import { X } from "lucide-react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { Switch } from "~/components/ui/switch";
import { Textarea } from "~/components/ui/textarea";
import { KASSE_TYPES, type KasseType } from "~/lib/kasse-types";

export type FormState = {
	kasseType: KasseType;
	iban: string;
	bic: string;
	bankName: string;
	paypalLink: string;
	description: string;
	isActive: boolean;
};

export const emptyForm: FormState = {
	kasseType: "Getränkekasse",
	iban: "",
	bic: "",
	bankName: "",
	paypalLink: "",
	description: "",
	isActive: true,
};

/** Create/edit form card of a bank account. */
export function KontoForm({
	form,
	setForm,
	onSubmit,
	onClose,
	isEditing,
	isAdmin,
	loading,
	error,
}: {
	form: FormState;
	setForm: React.Dispatch<React.SetStateAction<FormState>>;
	onSubmit: (e: React.FormEvent) => void;
	onClose: () => void;
	isEditing: boolean;
	isAdmin: boolean;
	loading: boolean;
	error: string | null;
}) {
	return (
		<Card className="border-primary/30">
			<CardHeader className="flex flex-row items-center justify-between pb-2">
				<CardTitle className="text-base">
					{isEditing ? "Konto bearbeiten" : "Neues Konto"}
				</CardTitle>
				<IconButton label="Formular schließen" onClick={onClose}>
					<X className="h-4 w-4" />
				</IconButton>
			</CardHeader>
			<CardContent>
				<form onSubmit={onSubmit} className="space-y-4">
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="k-type">Art der Kasse *</Label>
							<Select
								value={form.kasseType}
								onValueChange={(v) =>
									setForm((f) => ({ ...f, kasseType: v as KasseType }))
								}
								disabled={isEditing && !isAdmin}
							>
								<SelectTrigger id="k-type">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									{KASSE_TYPES.map((t) => (
										<SelectItem key={t} value={t}>
											{t}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
						<div className="space-y-2">
							<Label htmlFor="k-bankName">Bank *</Label>
							<Input
								id="k-bankName"
								value={form.bankName}
								onChange={(e) =>
									setForm((f) => ({ ...f, bankName: e.target.value }))
								}
								placeholder="z. B. Volksbank Stuttgart"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="k-iban">IBAN *</Label>
							<Input
								id="k-iban"
								value={form.iban}
								onChange={(e) =>
									setForm((f) => ({ ...f, iban: e.target.value }))
								}
								placeholder="DE00 0000 0000 0000 0000 00"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="k-bic">BIC *</Label>
							<Input
								id="k-bic"
								value={form.bic}
								onChange={(e) =>
									setForm((f) => ({ ...f, bic: e.target.value }))
								}
								placeholder="VOBADE21XXX"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="k-paypal">PayPal-Link</Label>
							<Input
								id="k-paypal"
								value={form.paypalLink}
								onChange={(e) =>
									setForm((f) => ({ ...f, paypalLink: e.target.value }))
								}
								placeholder="https://paypal.me/deinName"
							/>
						</div>
						<div className="flex items-center gap-3 pt-6">
							<Switch
								id="k-active"
								checked={form.isActive}
								onCheckedChange={(v) => setForm((f) => ({ ...f, isActive: v }))}
							/>
							<Label htmlFor="k-active">Aktiv</Label>
						</div>
					</div>
					<div className="space-y-2">
						<Label htmlFor="k-description">Beschreibung</Label>
						<Textarea
							id="k-description"
							value={form.description}
							onChange={(e) =>
								setForm((f) => ({ ...f, description: e.target.value }))
							}
							placeholder="Verwendungszweck..."
							rows={2}
						/>
					</div>
					{error && <p className="text-destructive text-sm">{error}</p>}
					<div className="flex gap-2">
						<Button type="submit" disabled={loading}>
							{loading ? "Speichern..." : isEditing ? "Speichern" : "Erstellen"}
						</Button>
						<Button type="button" variant="outline" onClick={onClose}>
							Abbrechen
						</Button>
					</div>
				</form>
			</CardContent>
		</Card>
	);
}
