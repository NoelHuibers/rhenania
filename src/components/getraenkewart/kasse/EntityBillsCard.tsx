"use client";

import { ChevronDown, Download, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmptyState } from "~/components/ui/empty-state";
import { IconButton } from "~/components/ui/icon-button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatDate, formatEUR } from "~/lib/format";
import { updateBillStatus } from "~/server/modules/billing/actions";
import { downloadEntityBillPDF } from "~/server/modules/getraenkekasse/actions";
import { billStatusClass, CollapsibleCard } from "./shared";
import type { BillStatus, EntityBill } from "./types";

/** Group (entity) bills with status changes and PDF download. */
export function EntityBillsCard({ bills }: { bills: EntityBill[] }) {
	const router = useRouter();
	const [downloading, setDownloading] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function setStatus(id: string, name: string, status: BillStatus) {
		setPendingId(id);
		startTransition(async () => {
			const res = await updateBillStatus(id, status);
			if (res.ok) {
				toast.success(
					status === "Bezahlt"
						? `${name} als bezahlt markiert`
						: status === "Gestundet"
							? `${name} gestundet`
							: `${name} auf unbezahlt gesetzt`,
				);
				router.refresh();
			} else {
				toast.error(res.error);
			}
			setPendingId(null);
		});
	}

	async function handleDownload(bill: EntityBill) {
		setDownloading(bill.id);
		try {
			const res = await downloadEntityBillPDF(bill.id);
			if (!res.ok) {
				toast.error(res.error);
				return;
			}
			const bytes = Uint8Array.from(atob(res.data.base64), (c) =>
				c.charCodeAt(0),
			);
			const blob = new Blob([bytes], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = res.data.fileName;
			a.click();
			URL.revokeObjectURL(url);
		} finally {
			setDownloading(null);
		}
	}

	const unpaid = bills.filter((b) => b.status === "Unbezahlt");
	const paid = bills.filter((b) => b.status !== "Unbezahlt");

	return (
		<CollapsibleCard
			title="Gruppenrechnungen"
			meta={
				unpaid.length > 0 ? (
					<span className="text-muted-foreground text-xs">
						{unpaid.length} offen
					</span>
				) : undefined
			}
		>
			{bills.length === 0 ? (
				<EmptyState
					variant="plain"
					className="py-6"
					icon={<Users />}
					title="Keine Gruppenrechnungen vorhanden"
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Gruppe</TableHead>
							<TableHead className="hidden sm:table-cell">Datum</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">Betrag</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{[...unpaid, ...paid].map((b) => (
							<TableRow
								key={b.id}
								// Settled rows recede without dropping below 4.5:1 (opacity did).
								className={
									b.status !== "Unbezahlt" ? "text-muted-foreground" : ""
								}
							>
								<TableCell className="font-medium text-sm">
									{b.userName}
								</TableCell>
								<TableCell className="hidden text-sm sm:table-cell">
									{formatDate(b.createdAt)}
								</TableCell>
								<TableCell>
									<DropdownMenu>
										<DropdownMenuTrigger asChild>
											<Button
												variant="outline"
												size="sm"
												disabled={isPending && pendingId === b.id}
												className={`h-7 ${billStatusClass(b.status)}`}
											>
												{b.status}
												<ChevronDown className="ml-1 size-3.5" />
											</Button>
										</DropdownMenuTrigger>
										<DropdownMenuContent align="start">
											<DropdownMenuRadioGroup
												value={b.status}
												onValueChange={(value) =>
													setStatus(b.id, b.userName, value as BillStatus)
												}
											>
												<DropdownMenuRadioItem value="Bezahlt">
													Bezahlt
												</DropdownMenuRadioItem>
												<DropdownMenuRadioItem value="Gestundet">
													Gestundet
												</DropdownMenuRadioItem>
												<DropdownMenuRadioItem value="Unbezahlt">
													Unbezahlt
												</DropdownMenuRadioItem>
											</DropdownMenuRadioGroup>
										</DropdownMenuContent>
									</DropdownMenu>
								</TableCell>
								<TableCell className="text-right font-semibold text-sm">
									{formatEUR(b.total)}
								</TableCell>
								<TableCell>
									<IconButton
										size="icon-sm"
										label={`PDF für ${b.userName} herunterladen`}
										disabled={downloading === b.id}
										onClick={() => handleDownload(b)}
									>
										<Download className="size-3.5" />
									</IconButton>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</CollapsibleCard>
	);
}
