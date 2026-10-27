"use client";

import { Download, Eye, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { paymentReference } from "~/lib/bill-payment";
import { formatDate, formatEUR } from "~/lib/format";
import { downloadUserBillPDF } from "~/server/actions/profile/downloadUserBill";
import type { getUserBillingData } from "~/server/actions/profile/getUserBill";
import { PAYMENT_DATA_MISSING, PayBillDrawer } from "./PayBillDrawer";

type UserBillingData = Awaited<ReturnType<typeof getUserBillingData>>;

/** Placeholder while the bill streams in. */
export function BillingOverviewSkeleton() {
	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-lg md:text-xl">Billing Overview</CardTitle>
			</CardHeader>
			<CardContent className="flex items-center justify-center py-8">
				<div className="flex items-center gap-2">
					<Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
					<span className="text-sm md:text-base">Loading billing data...</span>
				</div>
			</CardContent>
		</Card>
	);
}

/** The member's latest Getränke bill, loaded on the server (#24). */
export function BillingOverview({
	data,
	error = null,
}: {
	data: UserBillingData | null;
	/** Set when the server could not load the bill. */
	error?: string | null;
}) {
	const billData = data?.billData ?? null;
	const billItems = data?.billItems ?? [];
	const payment = data?.payment ?? null;
	const [downloadingPDF, setDownloadingPDF] = useState(false);

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
							{formatEUR(billData.total)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">Getränke</p>
						<p className="font-semibold text-base md:text-lg">
							{formatEUR(billData.drinksTotal)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">Mahnung</p>
						<p className="font-semibold text-base md:text-lg">
							{formatEUR(billData.fees)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">Umlage</p>
						<p className="font-semibold text-base md:text-lg">
							{formatEUR(billData.umlage)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">
							Altbetrag
						</p>
						<p className="font-semibold text-base md:text-lg">
							{formatEUR(billData.oldBalance)}
						</p>
					</div>
				</div>

				<div className="flex items-center justify-between text-[11px] text-muted-foreground md:text-sm">
					<span>Rechnung {billData.billNumber}</span>
					<span>Updated: {formatDate(billData.lastUpdated)}</span>
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
													{formatEUR(item.total)}
												</span>
											</div>
										))}
										<Separator />
										<div className="flex justify-between font-bold">
											<span>Total</span>
											<span>{formatEUR(billData.total)}</span>
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
				{/* The tenant has not set up its Getränkekasse: never guess a payee. */}
				{billData.status === "Unbezahlt" && !payment && (
					<div className="space-y-2">
						<Separator />
						<p className="text-muted-foreground text-sm">
							{PAYMENT_DATA_MISSING}
						</p>
					</div>
				)}

				{/* Same sheet as the open-bill banner on /trinken (#80). The
				    payment target comes from the server, the same source as the
				    bill PDF, so the profile never shows a different account. */}
				{billData.status === "Unbezahlt" && payment && (
					<div className="space-y-2">
						<Separator />
						<PayBillDrawer
							total={billData.total}
							billNumber={billData.billNumber}
							reference={paymentReference(
								billData.userName,
								billData.billNumber,
							)}
							payment={payment}
						>
							<Button type="button" className="h-12 w-full text-base">
								Bezahlen · {formatEUR(billData.total)}
							</Button>
						</PayBillDrawer>
					</div>
				)}
			</CardContent>
		</Card>
	);
}
