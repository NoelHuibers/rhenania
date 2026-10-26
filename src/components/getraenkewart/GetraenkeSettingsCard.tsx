"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFeature } from "~/components/TenantProvider";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { RadioGroup, RadioGroupItem } from "~/components/ui/radio-group";
import { Separator } from "~/components/ui/separator";
import { parseDecimalInput } from "~/lib/decimal";
import { applyMarkup, MAX_MARKUP_PERCENT } from "~/lib/pricing";
import {
	type GetraenkeSettings,
	setBillRecipient,
	setMarkupPercent,
} from "~/server/actions/getraenkewart/kasse";

function fmt(amount: number) {
	return `${amount.toFixed(2).replace(".", ",")} €`;
}

// Settings behind the per-tenant features. Rendered only for tenants that
// have at least one of them; each section shows only with its own flag.
export function GetraenkeSettingsCard({
	settings,
}: {
	settings: GetraenkeSettings;
}) {
	const markupEnabled = useFeature("drinks.markup");
	const treasurerEnabled = useFeature("billing.treasurerRecipient");
	if (!markupEnabled && !treasurerEnabled) {
		return null;
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Einstellungen</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				{markupEnabled && <MarkupSection initial={settings.markupPercent} />}
				{markupEnabled && treasurerEnabled && <Separator />}
				{treasurerEnabled && (
					<RecipientSection
						initialMode={settings.billRecipient}
						initialEmail={settings.treasurerEmail}
					/>
				)}
			</CardContent>
		</Card>
	);
}

function MarkupSection({ initial }: { initial: number }) {
	const router = useRouter();
	const [input, setInput] = useState(String(initial).replace(".", ","));
	const [isPending, startTransition] = useTransition();

	const parsed = parseDecimalInput(input);
	const valid =
		!Number.isNaN(parsed) && parsed >= 0 && parsed <= MAX_MARKUP_PERCENT;

	function save() {
		if (!valid) {
			return;
		}
		startTransition(async () => {
			const res = await setMarkupPercent(parsed);
			if (res.success) {
				toast.success("Aufschlag gespeichert");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<div className="space-y-2">
			<Label htmlFor="markup-percent">Preisaufschlag</Label>
			<div className="flex items-center gap-2">
				<Input
					id="markup-percent"
					inputMode="decimal"
					value={input}
					onChange={(e) => setInput(e.target.value)}
					className="w-28"
					aria-invalid={!valid}
				/>
				<span className="text-muted-foreground text-sm">%</span>
				<Button onClick={save} disabled={isPending || !valid} size="sm">
					{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
					Speichern
				</Button>
			</div>
			<p className="text-muted-foreground text-sm">
				Gilt für persönliche Bestellungen ab dem Speichern, gerundet auf ganze
				Cent. Gruppenbuchungen bleiben beim Einkaufspreis.
				{valid && parsed > 0 && (
					<>
						{" "}
						Beispiel: {fmt(1)} wird zu {fmt(applyMarkup(1, parsed))}.
					</>
				)}
			</p>
		</div>
	);
}

function RecipientSection({
	initialMode,
	initialEmail,
}: {
	initialMode: "members" | "treasurer";
	initialEmail: string;
}) {
	const router = useRouter();
	const [mode, setMode] = useState(initialMode);
	const [email, setEmail] = useState(initialEmail);
	const [isPending, startTransition] = useTransition();

	function save() {
		startTransition(async () => {
			const res = await setBillRecipient(mode, email);
			if (res.success) {
				toast.success("Rechnungsversand gespeichert");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<div className="space-y-3">
			<Label>Rechnungsversand</Label>
			<RadioGroup
				value={mode}
				onValueChange={(v) => setMode(v as "members" | "treasurer")}
				className="gap-2"
			>
				<div className="flex items-center gap-2">
					<RadioGroupItem value="members" id="recipient-members" />
					<Label htmlFor="recipient-members" className="font-normal">
						An die Mitglieder
					</Label>
				</div>
				<div className="flex items-center gap-2">
					<RadioGroupItem value="treasurer" id="recipient-treasurer" />
					<Label htmlFor="recipient-treasurer" className="font-normal">
						Alle Rechnungen einzeln an den Kassenwart
					</Label>
				</div>
			</RadioGroup>
			<div className="flex flex-wrap items-center gap-2">
				<Input
					type="email"
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="kassenwart@example.org"
					className="w-72"
					aria-label="E-Mail-Adresse des Kassenwarts"
				/>
				<Button onClick={save} disabled={isPending} size="sm">
					{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
					Speichern
				</Button>
			</div>
			<p className="text-muted-foreground text-sm">
				Beim Erstellen einer Abrechnung geht dann jede Rechnung als eigene Mail
				mit PDF an diese Adresse. Die Mitglieder bekommen keine Mail.
			</p>
		</div>
	);
}
