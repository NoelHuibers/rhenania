"use client";

import { FileDown, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { DatePicker } from "~/components/ui/date-picker";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import type { SemesterConfig } from "~/server/actions/semesterprogramm/semesterConfig";
import { upsertSemesterConfig } from "~/server/actions/semesterprogramm/semesterConfig";
import { SemProQRCode } from "./SemProQRCode";

export function SemProGenerieren({
	calendarUrl,
	initialConfig,
}: {
	calendarUrl: string;
	initialConfig: SemesterConfig | null;
}) {
	const router = useRouter();
	const [name, setName] = useState(initialConfig?.name ?? "");
	const [startDate, setStartDate] = useState<Date | undefined>(
		initialConfig?.startDate ?? undefined,
	);
	const [endDate, setEndDate] = useState<Date | undefined>(
		initialConfig?.endDate ?? undefined,
	);
	const [saving, setSaving] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saved, setSaved] = useState(false);

	async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		if (!name || !startDate || !endDate) {
			setError("Alle Felder sind Pflichtfelder.");
			return;
		}
		setSaving(true);
		setError(null);
		setSaved(false);

		const result = await upsertSemesterConfig({ name, startDate, endDate });

		setSaving(false);
		if (!result.success) {
			setError(result.error);
			return;
		}
		setSaved(true);
		router.refresh();
	}

	async function handleGenerate() {
		setGenerating(true);
		setError(null);
		try {
			const res = await fetch("/api/sempro/pdf");
			if (!res.ok) {
				const msg = await res.text();
				setError(msg || "PDF-Generierung fehlgeschlagen.");
				return;
			}
			const blob = await res.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download =
				res.headers
					.get("Content-Disposition")
					?.split('filename="')[1]
					?.replace('"', "") ?? "Semesterprogramm.pdf";
			a.click();
			URL.revokeObjectURL(url);
		} catch {
			setError("PDF-Generierung fehlgeschlagen.");
		} finally {
			setGenerating(false);
		}
	}

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="text-base">Semester</CardTitle>
				</CardHeader>
				<CardContent>
					<form onSubmit={handleSubmit} className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div className="space-y-2 sm:col-span-2">
								<Label htmlFor="sem-name">Bezeichnung</Label>
								<Input
									id="sem-name"
									value={name}
									onChange={(e) => {
										setName(e.target.value);
										setSaved(false);
									}}
									placeholder="z. B. Sommersemester 2025"
								/>
							</div>
							<div className="space-y-2">
								<Label>Beginn</Label>
								<DatePicker
									value={startDate}
									onChange={(d) => {
										setStartDate(d);
										setSaved(false);
									}}
								/>
							</div>
							<div className="space-y-2">
								<Label>Ende</Label>
								<DatePicker
									value={endDate}
									onChange={(d) => {
										setEndDate(d);
										setSaved(false);
									}}
								/>
							</div>
						</div>
						{error && <p className="text-destructive text-sm">{error}</p>}
						{saved && <p className="text-green-600 text-sm">Gespeichert.</p>}
						<Button type="submit" disabled={saving}>
							{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
							{saving ? "Speichern..." : "Speichern"}
						</Button>
					</form>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">
						Semesterprogramm generieren
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-muted-foreground text-xs">
						Erstellt das Semesterprogramm als druckfertiges PDF (185×250 mm,
						Druckfalz bei 61,75 mm und 123,5 mm).
					</p>
					<Button
						variant="outline"
						onClick={handleGenerate}
						disabled={generating}
					>
						{generating ? (
							<Loader2 className="mr-2 h-4 w-4 animate-spin" />
						) : (
							<FileDown className="mr-2 h-4 w-4" />
						)}
						{generating ? "Generiere..." : "PDF generieren"}
					</Button>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle className="text-base">Kalender QR-Code</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="mb-3 text-muted-foreground text-xs">
						QR-Code zum Abonnieren des Semesterprogramms als PNG herunterladen.
					</p>
					<SemProQRCode url={calendarUrl} />
				</CardContent>
			</Card>
		</div>
	);
}
