"use client";

import { Check, Copy, Download, Eye, Loader2 } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Drawer,
	DrawerContent,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "~/components/ui/drawer";
import { Separator } from "~/components/ui/separator";
import { downloadUserBillPDF } from "~/server/actions/profile/downloadUserBill";
import {
	type BillData,
	type BillItem,
	getUserBillingData,
} from "~/server/actions/profile/getUserBill";

const PAYPAL_BASE_URL = "https://paypal.me/CorpsRhenaniaBier/";
const IBAN = "DE65 5002 4024 3386 7890 30";
const IBAN_RAW = "DE65500240243386789030";
const ACCOUNT_HOLDER = "Noel Huibers";

export function BillingOverview() {
	const [billData, setBillData] = useState<BillData | null>(null);
	const [billItems, setBillItems] = useState<BillItem[]>([]);
	const [loading, setLoading] = useState(true);
	const [downloadingPDF, setDownloadingPDF] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [selectedPayment, setSelectedPayment] = useState<
		"paypal" | "iban" | null
	>(null);
	const [copiedField, setCopiedField] = useState<string | null>(null);

	useEffect(() => {
		async function fetchBillingData() {
			try {
				setLoading(true);
				const data = await getUserBillingData();
				setBillData(data.billData);
				setBillItems(data.billItems);
			} catch (err) {
				setError(
					err instanceof Error ? err.message : "Failed to load billing data",
				);
				console.error("Error fetching billing data:", err);
			} finally {
				setLoading(false);
			}
		}

		fetchBillingData();
	}, []);

	const paypalNote = billData
		? `${billData.userName} - Rechnung ${billData.billNumber}`
		: "";

	const copyToClipboard = (text: string, field: string) => {
		navigator.clipboard.writeText(text).then(() => {
			setCopiedField(field);
			toast.success(`${field} kopiert`);
			setTimeout(() => setCopiedField(null), 2000);
		});
	};

	const handlePayWithPayPal = () => {
		if (!billData) return;
		window.open(
			`${PAYPAL_BASE_URL}${billData.total.toFixed(2)}EUR`,
			"_blank",
			"noopener,noreferrer",
		);
	};

	const handleDownloadPDF = async () => {
		if (!billData?.billId) {
			toast.error("No bill period found");
			return;
		}

		try {
			setDownloadingPDF(true);

			const result = await downloadUserBillPDF(billData.billId);

			if (result.success && result.downloadUrl) {
				const link = document.createElement("a");
				link.href = result.downloadUrl;
				link.download =
					result.fileName || `Rechnung_${billData.billNumber}.pdf`;
				link.target = "_blank";
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);

				toast.success("PDF downloaded successfully");
			} else {
				toast.error(result.error || "Failed to download PDF");
			}
		} catch (error) {
			console.error("Error downloading PDF:", error);
			toast.error("An unexpected error occurred while downloading the PDF");
		} finally {
			setDownloadingPDF(false);
		}
	};

	const getStatusVariant = (status: string) => {
		switch (status) {
			case "Bezahlt":
				return "default" as const;
			case "Unbezahlt":
				return "destructive" as const;
			case "Gestundet":
				return "secondary" as const;
			default:
				return "secondary" as const;
		}
	};

	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">Billing Overview</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-8">
					<div className="flex items-center gap-2">
						<Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
						<span className="text-sm md:text-base">
							Loading billing data...
						</span>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">Billing Overview</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-8">
					<div className="text-center">
						<p className="mb-2 text-destructive text-sm md:text-base">
							Error loading billing data
						</p>
						<p className="text-muted-foreground text-xs md:text-sm">{error}</p>
						<Button
							onClick={() => window.location.reload()}
							variant="outline"
							className="mt-4 h-9 px-3 text-sm md:h-10 md:px-4 md:text-base"
						>
							Try Again
						</Button>
					</div>
				</CardContent>
			</Card>
		);
	}

	if (!billData) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">Getränkerechnung</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-8">
					<div className="text-center">
						<p className="text-muted-foreground text-sm md:text-base">
							Keine Rechnung gefunden
						</p>
						<p className="mt-1 text-muted-foreground text-xs md:text-sm">
							Du hast noch keine Getränkerechnung.
						</p>
					</div>
				</CardContent>
			</Card>
		);
	}

	const epcData = [
		"BCD",
		"002",
		"1",
		"SCT",
		"",
		ACCOUNT_HOLDER,
		IBAN_RAW,
		`EUR${billData.total.toFixed(2)}`,
		"",
		"",
		paypalNote,
	].join("\n");

	const ibanRows = [
		{
			label: "Kontoinhaber",
			value: ACCOUNT_HOLDER,
			copy: ACCOUNT_HOLDER,
			mono: false,
		},
		{ label: "IBAN", value: IBAN, copy: IBAN_RAW, mono: true },
		{
			label: "Betrag",
			value: `€${billData.total.toFixed(2)}`,
			copy: billData.total.toFixed(2),
			mono: false,
		},
		{
			label: "Verwendungszweck",
			value: paypalNote,
			copy: paypalNote,
			mono: false,
		},
	] as const;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between text-lg md:text-xl">
					Getränkerechnung
					<Badge
						variant={getStatusVariant(billData.status)}
						className="px-2 py-0.5 text-[10px] md:text-xs"
					>
						{billData.status}
					</Badge>
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-2 gap-4 md:grid-cols-4">
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">
							Gesamtbetrag
						</p>
						<p className="font-bold text-xl md:text-2xl">
							€{billData.total.toFixed(2)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">Getränke</p>
						<p className="font-semibold text-base md:text-lg">
							€{billData.drinksTotal.toFixed(2)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">Mahnung</p>
						<p className="font-semibold text-base md:text-lg">
							€{billData.fees.toFixed(2)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">Umlage</p>
						<p className="font-semibold text-base md:text-lg">
							€{billData.umlage?.toFixed(2) || "0.00"}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">
							Altbetrag
						</p>
						<p className="font-semibold text-base md:text-lg">
							€{billData.oldBalance.toFixed(2)}
						</p>
					</div>
				</div>

				<div className="flex items-center justify-between text-[11px] text-muted-foreground md:text-sm">
					<span>Rechnung {billData.billNumber}</span>
					<span>
						Updated:{" "}
						{new Date(billData.lastUpdated).toLocaleDateString("de-DE")}
					</span>
				</div>

				{/* Document buttons */}
				<div className="flex flex-col gap-2 sm:flex-row">
					<Drawer>
						<DrawerTrigger asChild>
							<Button
								aria-label="Rechnung ansehen"
								variant="outline"
								className="h-9 w-full bg-transparent px-3 text-sm sm:w-auto sm:self-start md:h-8 md:px-3 md:text-sm"
							>
								<Eye className="mr-2 h-3 w-3" />
								Rechnung ansehen
							</Button>
						</DrawerTrigger>
						<DrawerContent>
							<DrawerHeader>
								<DrawerTitle className="text-base md:text-lg">
									Rechnungsdetails #{billData.billNumber}
								</DrawerTitle>
							</DrawerHeader>
							<div className="space-y-4 p-4">
								{billItems.length > 0 ? (
									<>
										{billItems.map((item, index) => (
											<div
												// biome-ignore lint/suspicious/noArrayIndexKey: bill items have no unique id
												key={index}
												className="flex items-center justify-between"
											>
												<div>
													<span className="font-medium text-sm md:text-base">
														{item.item}
													</span>
													<span className="ml-2 text-muted-foreground text-xs md:text-sm">
														x{item.quantity}
													</span>
												</div>
												<span className="text-sm md:text-base">
													€{item.total.toFixed(2)}
												</span>
											</div>
										))}
										<Separator />
										<div className="flex justify-between font-bold">
											<span>Total</span>
											<span>€{billData.total.toFixed(2)}</span>
										</div>
									</>
								) : (
									<p className="py-4 text-center text-muted-foreground text-sm">
										No items found for this bill
									</p>
								)}
							</div>
						</DrawerContent>
					</Drawer>

					<Button
						aria-label="Download PDF"
						variant="outline"
						className="h-9 w-full bg-transparent px-3 text-sm sm:w-auto sm:self-start md:h-8 md:px-3 md:text-sm"
						onClick={handleDownloadPDF}
						disabled={downloadingPDF}
					>
						{downloadingPDF ? (
							<>
								<Loader2 className="mr-2 h-3 w-3 animate-spin" />
								Generating PDF...
							</>
						) : (
							<>
								<Download className="mr-2 h-3 w-3" />
								Download PDF
							</>
						)}
					</Button>
				</div>

				{/* Payment section — only when unpaid */}
				{billData.status === "Unbezahlt" && (
					<div className="space-y-2">
						<Separator />
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Bezahlen
						</p>

						{/* Method selector */}
						<div className="grid grid-cols-3 gap-2">
							<Button
								variant="outline"
								onClick={() =>
									setSelectedPayment(
										selectedPayment === "paypal" ? null : "paypal",
									)
								}
								className={`h-auto flex-col items-start gap-0 px-3 py-2 ${
									selectedPayment === "paypal"
										? "border-[#0070ba] bg-[#0070ba]/10 hover:bg-[#0070ba]/15"
										: ""
								}`}
							>
								<span className="font-semibold text-[#0070ba] text-xs">
									PayPal
								</span>
								<span className="text-[10px] text-muted-foreground">
									Freunde &amp; Familie
								</span>
							</Button>

							<Button
								variant="outline"
								onClick={() =>
									setSelectedPayment(selectedPayment === "iban" ? null : "iban")
								}
								className={`h-auto flex-col items-start gap-0 px-3 py-2 ${
									selectedPayment === "iban"
										? "border-foreground bg-foreground/5 hover:bg-foreground/10"
										: ""
								}`}
							>
								<span className="font-semibold text-xs">Überweisung</span>
								<span className="text-[10px] text-muted-foreground">IBAN</span>
							</Button>

							{/* Wero — coming soon */}
							<Button
								variant="outline"
								disabled
								className="relative h-auto flex-col items-start gap-0 px-3 py-2 opacity-40"
							>
								<span className="font-semibold text-xs">Wero</span>
								<span className="text-[10px] text-muted-foreground">
									Demnächst
								</span>
								<Badge
									variant="secondary"
									className="absolute top-1.5 right-1.5 px-1 py-0 text-[9px] leading-tight"
								>
									bald
								</Badge>
							</Button>
						</div>

						{/* PayPal detail panel */}
						{selectedPayment === "paypal" && (
							<div className="space-y-2 rounded-lg border border-[#0070ba]/25 bg-[#0070ba]/5 p-3">
								<div className="flex items-center justify-between">
									<span className="text-muted-foreground text-xs">Betrag</span>
									<span className="font-semibold text-xs">
										€{billData.total.toFixed(2)}
									</span>
								</div>
								<Separator />
								<div className="flex items-center justify-between gap-2">
									<span className="shrink-0 text-muted-foreground text-xs">
										Notiz
									</span>
									<div className="flex min-w-0 items-center gap-1">
										<span className="wrap-break-word text-right font-mono text-[11px] leading-snug">
											{paypalNote}
										</span>
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 shrink-0"
											onClick={() => copyToClipboard(paypalNote, "Notiz")}
											aria-label="Notiz kopieren"
										>
											{copiedField === "Notiz" ? (
												<Check className="h-3 w-3 text-green-500" />
											) : (
												<Copy className="h-3 w-3" />
											)}
										</Button>
									</div>
								</div>
								<Button
									onClick={handlePayWithPayPal}
									className="h-8 w-full bg-[#0070ba] text-white text-xs hover:bg-[#005ea6]"
								>
									Jetzt mit PayPal bezahlen
								</Button>
							</div>
						)}

						{/* IBAN detail panel */}
						{selectedPayment === "iban" && (
							<div className="flex overflow-hidden rounded-lg border">
								{/* Copy fields */}
								<div className="min-w-0 flex-1 divide-y">
									{ibanRows.map(({ label, value, copy, mono }) => (
										<div
											key={label}
											className="flex items-center justify-between px-3 py-2"
										>
											<div className="min-w-0">
												<p className="text-[10px] text-muted-foreground">
													{label}
												</p>
												<p
													className={`wrap-break-word text-xs ${mono ? "font-mono" : "font-medium"}`}
												>
													{value}
												</p>
											</div>
											<Button
												variant="ghost"
												size="icon"
												className="ml-2 h-6 w-6 shrink-0"
												onClick={() => copyToClipboard(copy, label)}
												aria-label={`${label} kopieren`}
											>
												{copiedField === label ? (
													<Check className="h-3 w-3 text-green-500" />
												) : (
													<Copy className="h-3 w-3" />
												)}
											</Button>
										</div>
									))}
								</div>

								{/* QR code */}
								<div className="flex shrink-0 flex-col items-center justify-center gap-1.5 border-l bg-white px-3 py-3 dark:bg-white">
									<QRCodeSVG
										value={epcData}
										size={96}
										level="M"
										className="rounded"
									/>
									<p className="text-center text-[9px] text-gray-400">
										GiroCode
									</p>
								</div>
							</div>
						)}
					</div>
				)}
			</CardContent>
		</Card>
	);
}
