"use client";

import {
	AlertTriangle,
	ChevronDown,
	ChevronUp,
	Landmark,
	Loader2,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type GetraenkeBillingProfileInput,
	type GetraenkeBillingSettings,
	updateGetraenkeBillingProfile,
} from "~/server/actions/getraenkewart/kasse";

type TextField = Exclude<keyof GetraenkeBillingProfileInput, "paymentDueDays">;

const FIELDS: Array<{
	key: TextField;
	label: string;
	placeholder: string;
	hint?: string;
	autoComplete?: string;
}> = [
	{
		key: "senderName",
		label: "Absender",
		placeholder: "Vor- und Nachname",
		hint: "Steht oben links und unter dem Brief.",
		autoComplete: "name",
	},
	{
		key: "accountHolder",
		label: "Kontoinhaber",
		placeholder: "Wie bei der Bank hinterlegt",
		hint: "Muss zum Konto passen, sonst warnt die Bank beim Überweisen.",
	},
	{
		key: "senderStreet",
		label: "Straße und Hausnummer",
		placeholder: "Musterstraße 1",
		autoComplete: "street-address",
	},
	{
		key: "senderCity",
		label: "PLZ und Ort",
		placeholder: "12345 Musterstadt",
	},
	{
		key: "location",
		label: "Ort im Datum (optional)",
		placeholder: "Sonst der Ort aus PLZ und Ort",
	},
	{
		key: "website",
		label: "Website (optional)",
		placeholder: "www.example.org",
		autoComplete: "url",
	},
];

/**
 * Sender and account holder of the Getränke bills. Billing is blocked until
 * these and an active Getränkekasse konto are set up, so the card opens
 * itself and explains what is missing.
 */
export function GetraenkeBillingCard({
	settings,
}: {
	settings: GetraenkeBillingSettings;
}) {
	const router = useRouter();
	const id = useId();
	const incomplete = settings.missing.length > 0;
	const [open, setOpen] = useState(incomplete);
	const [form, setForm] = useState(settings.profile);
	const [dueDays, setDueDays] = useState(
		String(settings.profile.paymentDueDays),
	);
	const [isPending, startTransition] = useTransition();

	const dueDaysNumber = Number(dueDays);
	const dueDaysValid =
		Number.isInteger(dueDaysNumber) &&
		dueDaysNumber >= 1 &&
		dueDaysNumber <= 90;

	function save() {
		if (!dueDaysValid) {
			return;
		}
		startTransition(async () => {
			const res = await updateGetraenkeBillingProfile({
				...form,
				paymentDueDays: dueDaysNumber,
			});
			if (res.success) {
				toast.success("Absender und Kontoinhaber gespeichert");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	}

	return (
		<Card>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger asChild>
					<CardHeader className="flex cursor-pointer flex-row items-center justify-between transition-colors hover:bg-muted/50">
						<div className="flex items-center gap-2">
							<CardTitle className="text-base">Absender und Konto</CardTitle>
							{incomplete ? (
								<Badge variant="destructive">Unvollständig</Badge>
							) : (
								<Badge variant="secondary">Vollständig</Badge>
							)}
						</div>
						<Button
							variant="ghost"
							size="icon"
							className="size-7"
							tabIndex={-1}
							aria-hidden
						>
							{open ? (
								<ChevronUp className="size-4" />
							) : (
								<ChevronDown className="size-4" />
							)}
						</Button>
					</CardHeader>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="space-y-5">
						{incomplete && (
							<Alert variant="destructive">
								<AlertTriangle />
								<AlertTitle>Abrechnung gesperrt</AlertTitle>
								<AlertDescription>
									Bitte Absender und Konto in der Kasse hinterlegen. Es fehlt:{" "}
									{settings.missing.join(", ")}.
								</AlertDescription>
							</Alert>
						)}

						<div className="flex items-start gap-3 rounded-lg border p-3">
							<Landmark className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
							<div className="min-w-0 space-y-0.5 text-sm">
								{settings.payment ? (
									<>
										<p className="font-mono">{settings.payment.iban}</p>
										<p className="break-all text-muted-foreground">
											{settings.payment.paypalBaseUrl ?? "Kein PayPal-Link"}
										</p>
									</>
								) : (
									<p>Kein aktives Getränkekasse-Konto mit gültiger IBAN.</p>
								)}
								<p className="text-muted-foreground">
									IBAN und PayPal kommen aus dem Getränkekasse-Konto unter{" "}
									<Link href="/konten" className="underline underline-offset-2">
										Konten
									</Link>
									.
								</p>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
							{FIELDS.map((field) => (
								<div key={field.key} className="space-y-1.5">
									<Label htmlFor={`${id}-${field.key}`}>{field.label}</Label>
									<Input
										id={`${id}-${field.key}`}
										value={form[field.key]}
										onChange={(e) =>
											setForm((prev) => ({
												...prev,
												[field.key]: e.target.value,
											}))
										}
										placeholder={field.placeholder}
										autoComplete={field.autoComplete ?? "off"}
										maxLength={255}
									/>
									{field.hint && (
										<p className="text-muted-foreground text-xs">
											{field.hint}
										</p>
									)}
								</div>
							))}
							<div className="space-y-1.5">
								<Label htmlFor={`${id}-due`}>Zahlungsziel (Tage)</Label>
								<Input
									id={`${id}-due`}
									inputMode="numeric"
									value={dueDays}
									onChange={(e) => setDueDays(e.target.value)}
									className="w-28"
									aria-invalid={!dueDaysValid}
								/>
							</div>
						</div>

						<div className="flex justify-end">
							<Button onClick={save} disabled={isPending || !dueDaysValid}>
								{isPending && <Loader2 className="mr-2 size-4 animate-spin" />}
								Speichern
							</Button>
						</div>
					</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}
