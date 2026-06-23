"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatEur } from "~/lib/cc-kasse-format";
import {
	cancelMyReimbursement,
	type MyReimbursement,
} from "~/server/actions/cc-kasse/kostenerstattungen";
import { ReceiptLinks } from "./ReceiptLinks";
import { ReimbursementStatusBadge } from "./ReimbursementStatusBadge";

export function MyReimbursementsTable({
	reimbursements,
	onEdit,
}: {
	reimbursements: MyReimbursement[];
	onEdit: (r: MyReimbursement) => void;
}) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();

	const cancel = (id: string) => {
		startTransition(async () => {
			const res = await cancelMyReimbursement(id);
			if (res.success) {
				toast.success("Antrag storniert");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	if (reimbursements.length === 0) {
		return (
			<p className="py-8 text-center text-muted-foreground text-sm">
				Noch keine Kostenerstattungen eingereicht.
			</p>
		);
	}

	return (
		<Table>
			<TableHeader>
				<TableRow>
					<TableHead>Datum</TableHead>
					<TableHead>Kostenpunkt</TableHead>
					<TableHead>Beschreibung</TableHead>
					<TableHead className="text-right">Betrag</TableHead>
					<TableHead>Status</TableHead>
					<TableHead>Beleg</TableHead>
					<TableHead />
				</TableRow>
			</TableHeader>
			<TableBody>
				{reimbursements.map((r) => (
					<TableRow key={r.id}>
						<TableCell className="whitespace-nowrap">
							{new Date(r.expenseDate).toLocaleDateString("de-DE")}
						</TableCell>
						<TableCell>
							<span className="text-muted-foreground text-xs">
								{r.kostenpunkt?.category}
							</span>
							<br />
							{r.kostenpunkt?.name ?? "—"}
						</TableCell>
						<TableCell className="max-w-[220px]">
							<span className="line-clamp-2">{r.description}</span>
							{r.status === "Abgelehnt" && r.rejectionReason && (
								<span className="mt-1 block text-red-700 text-xs">
									Abgelehnt: {r.rejectionReason}
								</span>
							)}
						</TableCell>
						<TableCell className="text-right font-medium">
							{formatEur(r.amount)}
						</TableCell>
						<TableCell>
							<ReimbursementStatusBadge status={r.status} />
						</TableCell>
						<TableCell>
							<ReceiptLinks
								receipts={r.receipts}
								legacyUrl={r.receiptUrl}
								legacyName={r.receiptName}
							/>
						</TableCell>
						<TableCell className="text-right">
							{r.status === "Eingereicht" && (
								<div className="flex justify-end gap-1">
									<Button
										variant="ghost"
										size="sm"
										disabled={isPending}
										onClick={() => onEdit(r)}
									>
										Bearbeiten
									</Button>
									<Button
										variant="ghost"
										size="sm"
										disabled={isPending}
										onClick={() => cancel(r.id)}
									>
										Stornieren
									</Button>
								</div>
							)}
						</TableCell>
					</TableRow>
				))}
			</TableBody>
		</Table>
	);
}
