"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { DataList, type DataListColumn } from "~/components/ui/data-list";
import { ReimbursementStatusBadge } from "~/components/ui/status-badge";
import { formatDate, formatEUR } from "~/lib/format";
import {
	cancelMyReimbursement,
	type MyReimbursement,
} from "~/server/actions/cc-kasse/kostenerstattungen";
import { ReceiptLinks } from "./ReceiptLinks";

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

	const actions = (r: MyReimbursement) =>
		r.status === "Eingereicht" ? (
			<div className="flex gap-1">
				<Button
					variant="outline"
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
		) : null;

	const columns: DataListColumn<MyReimbursement>[] = [
		{
			id: "date",
			header: "Datum",
			cell: ({ row }) => formatDate(row.original.expenseDate),
			meta: { mobile: "meta" },
		},
		{
			id: "kostenpunkt",
			header: "Kostenpunkt",
			cell: ({ row: { original: r } }) => (
				<>
					<span className="block text-muted-foreground text-xs">
						{r.kostenpunkt?.category}
					</span>
					{r.kostenpunkt?.name ?? "—"}
				</>
			),
			meta: { mobile: "title" },
		},
		{
			id: "description",
			header: "Beschreibung",
			cell: ({ row: { original: r } }) => (
				<>
					<span className="md:line-clamp-2">{r.description}</span>
					{r.status === "Abgelehnt" && r.rejectionReason && (
						<span className="mt-1 block text-danger-muted-foreground text-xs">
							Abgelehnt: {r.rejectionReason}
						</span>
					)}
				</>
			),
			meta: {
				mobile: "subtitle",
				className: "md:max-w-[220px] md:whitespace-normal",
			},
		},
		{
			id: "amount",
			header: "Betrag",
			cell: ({ row }) => formatEUR(row.original.amount),
			meta: { mobile: "meta", className: "text-right font-medium" },
		},
		{
			id: "status",
			header: "Status",
			cell: ({ row }) => (
				<ReimbursementStatusBadge status={row.original.status} />
			),
			meta: { mobile: "meta" },
		},
		{
			id: "receipt",
			header: "Beleg",
			cell: ({ row: { original: r } }) => (
				<ReceiptLinks
					receipts={r.receipts}
					legacyUrl={r.receiptUrl}
					legacyName={r.receiptName}
				/>
			),
			meta: { mobile: "meta" },
		},
		{
			id: "actions",
			header: () => <span className="sr-only">Aktionen</span>,
			cell: ({ row }) => actions(row.original),
			meta: { mobile: "action", className: "md:text-right" },
		},
	];

	return (
		<DataList
			data={reimbursements}
			columns={columns}
			getRowId={(r) => r.id}
			caption="Meine Kostenerstattungen"
		/>
	);
}
