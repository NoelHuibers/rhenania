"use client";

import { Download, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { formatCurrency } from "~/components/rechnungen/BillingTable";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import type { FuchsenBillingConfig } from "~/server/actions/fuchsenladen/billingConfig";
import { generateFuchsenBillPDF } from "~/server/actions/fuchsenladen/billingPdf";
import type { FuchsenBillingEntry } from "~/server/actions/fuchsenladen/billings";

function paypalLink(base: string, amount: number): string {
	const normalized = base.endsWith("/") ? base : `${base}/`;
	return `${normalized}${amount.toFixed(2)}EUR`;
}

export function FuchsenBillDetailsDialog({
	entry,
	config,
}: {
	entry: FuchsenBillingEntry;
	config: FuchsenBillingConfig;
}) {
	const [downloading, setDownloading] = useState(false);
	const isPaid = entry.status === "Bezahlt";
	const canPayPal = !!config.paypalBaseUrl && !isPaid;

	const handleDownload = async () => {
		setDownloading(true);
		try {
			const result = await generateFuchsenBillPDF(entry.id);
			if (!result.success || !result.base64) {
				toast.error(result.error || "PDF konnte nicht erstellt werden");
				return;
			}
			const bytes = Uint8Array.from(atob(result.base64), (c) =>
				c.charCodeAt(0),
			);
			const url = URL.createObjectURL(
				new Blob([bytes], { type: "application/pdf" }),
			);
			const link = document.createElement("a");
			link.href = url;
			link.download = result.fileName ?? "Fuchsenrechnung.pdf";
			document.body.appendChild(link);
			link.click();
			setTimeout(() => {
				document.body.removeChild(link);
				URL.revokeObjectURL(url);
			}, 100);
		} catch {
			toast.error("Fehler beim Herunterladen der PDF");
		} finally {
			setDownloading(false);
		}
	};

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline" size="sm">
					Details
				</Button>
			</DialogTrigger>
			<DialogContent className="mx-auto flex max-h-[90vh] w-[95vw] max-w-2xl flex-col">
				<DialogHeader className="flex-shrink-0">
					<DialogTitle className="break-words text-base sm:text-lg">
						Rechnung {entry.name}
					</DialogTitle>
				</DialogHeader>

				<div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-1">
					<div className="overflow-x-auto">
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Artikel</TableHead>
									<TableHead className="text-right">Anzahl</TableHead>
									<TableHead className="text-right">Einzelpreis</TableHead>
									<TableHead className="text-right">Summe</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{entry.items.map((item) => (
									<TableRow key={item.id}>
										<TableCell className="font-medium">{item.name}</TableCell>
										<TableCell className="text-right">
											{item.quantity}
										</TableCell>
										<TableCell className="text-right">
											{formatCurrency(item.unitPrice)}
										</TableCell>
										<TableCell className="text-right font-medium">
											{formatCurrency(item.subtotal)}
										</TableCell>
									</TableRow>
								))}
							</TableBody>
						</Table>
					</div>

					{!!entry.oldBillingAmount && entry.oldBillingAmount > 0 && (
						<div className="flex items-center justify-between text-muted-foreground text-sm">
							<span>Alter Saldo</span>
							<span>{formatCurrency(entry.oldBillingAmount)}</span>
						</div>
					)}

					<div className="flex items-center justify-between border-border border-t pt-4">
						<span className="font-semibold text-base sm:text-lg">Gesamt:</span>
						<span className="font-bold text-green-600 text-lg sm:text-xl dark:text-green-400">
							{formatCurrency(entry.totalDue)}
						</span>
					</div>

					{(config.iban || canPayPal) && !isPaid && (
						<div className="space-y-3 rounded-lg border bg-muted/40 p-3">
							<p className="font-medium text-sm">Bezahlen</p>
							{canPayPal && (
								<Button
									className="w-full gap-2"
									onClick={() =>
										window.open(
											paypalLink(config.paypalBaseUrl, entry.totalDue),
											"_blank",
											"noopener,noreferrer",
										)
									}
								>
									<ExternalLink className="h-4 w-4" />
									Mit PayPal bezahlen
								</Button>
							)}
							{config.iban && (
								<div className="text-sm">
									<p className="text-muted-foreground text-xs">
										Oder per Überweisung:
									</p>
									<p className="font-mono">{config.iban}</p>
									{config.accountHolder && <p>{config.accountHolder}</p>}
								</div>
							)}
						</div>
					)}

					<Button
						variant="outline"
						className="w-full gap-2"
						onClick={handleDownload}
						disabled={downloading}
					>
						{downloading ? (
							<Loader2 className="h-4 w-4 animate-spin" />
						) : (
							<Download className="h-4 w-4" />
						)}
						PDF herunterladen
					</Button>
				</div>
			</DialogContent>
		</Dialog>
	);
}
