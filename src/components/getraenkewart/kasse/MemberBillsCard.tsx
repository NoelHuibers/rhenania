"use client";

import { CheckCircle, ChevronDown, ReceiptText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useFeature } from "~/components/TenantProvider";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Button } from "~/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { EmptyState } from "~/components/ui/empty-state";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { formatEUR } from "~/lib/format";
import { markAllMemberBillsPaid } from "~/server/actions/getraenkewart/kasse";
import { updateBillStatus } from "~/server/modules/billing/actions";
import { billStatusClass, CollapsibleCard } from "./shared";
import type { BillStatus, MemberBill } from "./types";

/** Open member bills with per-bill status and an optional "all paid" action. */
export function MemberBillsCard({ bills }: { bills: MemberBill[] }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [pendingId, setPendingId] = useState<string | null>(null);
	const markAllPaidEnabled = useFeature("billing.markAllPaid");
	const total = bills.reduce((s, b) => s + b.total, 0);
	// "Alle haben gezahlt" leaves credits open, to be carried (#220).
	const payable = bills.filter((b) => b.total >= 0);
	const credits = bills.length - payable.length;
	const payableTotal = payable.reduce((s, b) => s + b.total, 0);

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

	function markAllPaid() {
		startTransition(async () => {
			const res = await markAllMemberBillsPaid();
			if (res.ok) {
				toast.success(`${res.data.count} Rechnungen als bezahlt markiert`);
			} else {
				toast.error(res.error);
			}
			router.refresh();
		});
	}

	return (
		<CollapsibleCard
			title="Offene Mitgliederrechnungen"
			meta={
				bills.length > 0 ? (
					<span className="text-muted-foreground text-xs">
						{bills.length} • {formatEUR(total)}
					</span>
				) : undefined
			}
			action={
				markAllPaidEnabled && payable.length > 0 ? (
					<AlertDialog>
						<AlertDialogTrigger asChild>
							<Button
								size="sm"
								variant="outline"
								disabled={isPending}
								onClick={(e) => e.stopPropagation()}
							>
								<CheckCircle className="mr-1 size-4" />
								Alle haben gezahlt
							</Button>
						</AlertDialogTrigger>
						<AlertDialogContent onClick={(e) => e.stopPropagation()}>
							<AlertDialogHeader>
								<AlertDialogTitle>
									Alle Rechnungen als bezahlt markieren?
								</AlertDialogTitle>
								<AlertDialogDescription>
									{payable.length} offene Mitgliederrechnungen über insgesamt{" "}
									{formatEUR(payableTotal)} werden auf „Bezahlt" gesetzt, auch
									gestundete. Gruppenrechnungen bleiben unverändert.
									{credits > 0 &&
										` ${credits} Guthaben bleiben offen und werden mit der nächsten Rechnung verrechnet.`}
								</AlertDialogDescription>
							</AlertDialogHeader>
							<AlertDialogFooter>
								<AlertDialogCancel>Abbrechen</AlertDialogCancel>
								<AlertDialogAction onClick={markAllPaid}>
									Ja, alle bezahlt
								</AlertDialogAction>
							</AlertDialogFooter>
						</AlertDialogContent>
					</AlertDialog>
				) : undefined
			}
		>
			{bills.length === 0 ? (
				<EmptyState
					variant="plain"
					className="py-6"
					icon={<ReceiptText />}
					title="Keine offenen Rechnungen"
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Mitglied</TableHead>
							<TableHead className="text-right">Betrag</TableHead>
							<TableHead className="text-right">Status</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{bills.map((b) => (
							<TableRow key={b.id}>
								<TableCell className="font-medium text-sm">
									{b.userName}
								</TableCell>
								<TableCell className="text-right font-semibold text-sm">
									{formatEUR(b.total)}
								</TableCell>
								<TableCell className="text-right">
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
										<DropdownMenuContent align="end">
											<DropdownMenuRadioGroup
												value={b.status}
												onValueChange={(v) =>
													setStatus(b.id, b.userName, v as BillStatus)
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
							</TableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell className="font-semibold">Gesamt</TableCell>
							<TableCell className="text-right font-bold">
								{formatEUR(total)}
							</TableCell>
							<TableCell />
						</TableRow>
					</TableFooter>
				</Table>
			)}
		</CollapsibleCard>
	);
}
