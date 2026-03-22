import { Download } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { saveBillPeriodCSV } from "~/server/actions/billings/saveBillCSV";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface BillingCardProps {
	title: string;
	description: string;
	children: React.ReactNode;
	headerDate?: string;
	billPeriodId?: string;
}

export const BillingCard = ({
	title,
	description,
	children,
	headerDate,
	billPeriodId,
}: BillingCardProps) => {
	const [isDownloading, setIsDownloading] = useState(false);

	const handleDownload = async () => {
		setIsDownloading(true);
		try {
			if (!billPeriodId) {
				toast.error("No bill period ID available");
				return;
			}

			const result = await saveBillPeriodCSV(billPeriodId);

			if (result.success && result.downloadUrl) {
				// Create download link with proper attributes
				const link = document.createElement("a");
				link.href = result.downloadUrl;
				link.download = result.fileName || `bill_${billPeriodId}.csv`;

				// Set attributes for better browser handling
				link.setAttribute("target", "_blank");
				link.setAttribute("rel", "noopener noreferrer");

				// Ensure the link is properly styled (invisible)
				link.style.display = "none";

				document.body.appendChild(link);
				link.click();

				// Clean up
				setTimeout(() => {
					document.body.removeChild(link);
				}, 100);

				toast.success(
					result.wasExisting
						? "CSV downloaded (existing file)"
						: "CSV generated and downloaded",
				);
			} else {
				toast.error(result.error || "Failed to download CSV");
			}
		} catch (error) {
			console.error("Download error:", error);
			toast.error("Error downloading CSV");
		} finally {
			setIsDownloading(false);
		}
	};

	return (
		<Card>
			<CardHeader className="pb-3">
				<div className="flex flex-col space-y-2 sm:flex-row sm:items-start sm:justify-between sm:space-y-0">
					<div className="min-w-0 flex-1">
						<CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
						<p className="mt-1 text-muted-foreground text-sm">{description}</p>
					</div>
					<div className="flex flex-shrink-0 items-center gap-2 sm:ml-4">
						{billPeriodId && (
							<Button
								variant="outline"
								size="sm"
								onClick={handleDownload}
								disabled={isDownloading}
								className="gap-2"
							>
								<Download className="h-4 w-4" />
								{isDownloading ? "Downloading..." : "Export CSV"}
							</Button>
						)}
						{headerDate && (
							<div className="text-muted-foreground text-sm">{headerDate}</div>
						)}
					</div>
				</div>
			</CardHeader>
			<CardContent className="pt-0">{children}</CardContent>
		</Card>
	);
};
