"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type FuchsenBillingConfigInput,
	getFuchsenBillingConfig,
	updateFuchsenBillingConfig,
} from "~/server/actions/fuchsenladen/billingConfig";

const EMPTY: FuchsenBillingConfigInput = {
	senderName: "",
	senderStreet: "",
	senderCity: "",
	location: "",
	iban: "",
	accountHolder: "",
	paypalBaseUrl: "",
	paymentDueDays: 14,
};

export function FuchsenBillingSettings({ onSaved }: { onSaved?: () => void }) {
	const [form, setForm] = useState<FuchsenBillingConfigInput>(EMPTY);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		getFuchsenBillingConfig()
			.then((c) =>
				setForm({
					senderName: c.senderName,
					senderStreet: c.senderStreet,
					senderCity: c.senderCity,
					location: c.location,
					iban: c.iban,
					accountHolder: c.accountHolder,
					paypalBaseUrl: c.paypalBaseUrl,
					paymentDueDays: c.paymentDueDays,
				}),
			)
			.catch(() => toast.error("Fehler beim Laden der Zahlungsdaten"))
			.finally(() => setLoading(false));
	}, []);

	const set = (key: keyof FuchsenBillingConfigInput, value: string | number) =>
		setForm((prev) => ({ ...prev, [key]: value }));

	const handleSave = async () => {
		setSaving(true);
		try {
			const result = await updateFuchsenBillingConfig(form);
			if (result.success) {
				toast.success(result.message ?? "Gespeichert");
				onSaved?.();
			} else {
				toast.error(result.error ?? "Fehler beim Speichern");
			}
		} finally {
			setSaving(false);
		}
	};

	if (loading) {
		return (
			<div className="flex items-center justify-center py-12">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg">Zahlungsdaten & Absender</CardTitle>
				<p className="text-muted-foreground text-sm">
					Diese Angaben erscheinen auf den Rechnungs-PDFs und steuern den
					PayPal-Zahllink.
				</p>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
					<Field label="Absender Name">
						<Input
							value={form.senderName}
							onChange={(e) => set("senderName", e.target.value)}
							placeholder="Vorname Nachname"
						/>
					</Field>
					<Field label="Kontoinhaber">
						<Input
							value={form.accountHolder}
							onChange={(e) => set("accountHolder", e.target.value)}
							placeholder="Kontoinhaber"
						/>
					</Field>
					<Field label="Straße & Hausnummer">
						<Input
							value={form.senderStreet}
							onChange={(e) => set("senderStreet", e.target.value)}
							placeholder="Musterstraße 1"
						/>
					</Field>
					<Field label="PLZ & Ort">
						<Input
							value={form.senderCity}
							onChange={(e) => set("senderCity", e.target.value)}
							placeholder="70173 Stuttgart"
						/>
					</Field>
					<Field label="Ort (Datumszeile)">
						<Input
							value={form.location}
							onChange={(e) => set("location", e.target.value)}
							placeholder="Stuttgart"
						/>
					</Field>
					<Field label="Zahlungsziel (Tage)">
						<Input
							type="number"
							min={1}
							max={90}
							value={form.paymentDueDays}
							onChange={(e) =>
								set("paymentDueDays", Number(e.target.value) || 14)
							}
						/>
					</Field>
					<Field label="IBAN">
						<Input
							value={form.iban}
							onChange={(e) => set("iban", e.target.value)}
							placeholder="DE00 0000 0000 0000 0000 00"
						/>
					</Field>
					<Field label="PayPal-Link (paypal.me)">
						<Input
							value={form.paypalBaseUrl}
							onChange={(e) => set("paypalBaseUrl", e.target.value)}
							placeholder="https://paypal.me/DeinName/"
						/>
					</Field>
				</div>
				<Button onClick={handleSave} disabled={saving} className="gap-2">
					{saving && <Loader2 className="h-4 w-4 animate-spin" />}
					Speichern
				</Button>
			</CardContent>
		</Card>
	);
}

function Field({
	label,
	children,
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="space-y-1.5">
			<Label className="text-sm">{label}</Label>
			{children}
		</div>
	);
}
