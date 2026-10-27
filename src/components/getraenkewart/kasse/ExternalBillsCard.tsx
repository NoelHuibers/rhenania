"use client";

import { CheckCircle, FileCheck, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { ConfirmAction } from "~/components/ui/confirm-action";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { EmptyState } from "~/components/ui/empty-state";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { BillStatusBadge } from "~/components/ui/status-badge";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { parseDecimalInput } from "~/lib/decimal";
import { formatEUR } from "~/lib/format";
import {
	addExternalBill,
	deleteExternalBill,
	markExternalBillPaid,
} from "~/server/actions/getraenkewart/kasse";
import { CollapsibleCard } from "./shared";
import type { ExternalBill } from "./types";

/** External liabilities (creditors) with add, mark-paid and delete. */
export function ExternalBillsCard({ bills }: { bills: ExternalBill[] }) {
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [creditor, setCreditor] = useState("");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleAdd() {
		const parsed = parseDecimalInput(amount);
		if (Number.isNaN(parsed) || !creditor.trim() || !description.trim()) {
			return;
		}
		startTransition(async () => {
			const res = await addExternalBill({
				creditor: creditor.trim(),
				description: description.trim(),
				amount: parsed,
			});
			if (res.success) {
				toast.success("Verbindlichkeit hinzugefügt");
				setDialogOpen(false);
				setCreditor("");
				setDescription("");
				setAmount("");
				router.refresh();
			} else {
				toast.error("Fehler beim Hinzufügen");
			}
		});
	}

	function handlePaid(id: string) {
		startTransition(async () => {
			const res = await markExternalBillPaid(id);
			if (res.success) {
				toast.success("Als bezahlt markiert");
				router.refresh();
			} else {
				toast.error(res.error ?? "Status konnte nicht geändert werden");
			}
		});
	}

	function handleDelete(id: string) {
		startTransition(async () => {
			const res = await deleteExternalBill(id);
			if (res.success) {
				toast.success("Gelöscht");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler beim Löschen");
			}
		});
	}

	const openBills = bills.filter((b) => b.status === "Offen");
	const paidBills = bills.filter((b) => b.status === "Bezahlt");
	const openTotal = openBills.reduce((s, b) => s + b.amount, 0);

	return (
		<CollapsibleCard
			title="Externe Verbindlichkeiten"
			meta={
				openBills.length > 0 ? (
					<span className="text-muted-foreground text-xs">
						{openBills.length} offen • {formatEUR(openTotal)}
					</span>
				) : undefined
			}
			action={
				<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
					<DialogTrigger asChild>
						<Button
							size="sm"
							variant="outline"
							onClick={(e) => e.stopPropagation()}
						>
							<Plus className="mr-1 size-4" />
							Hinzufügen
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Verbindlichkeit hinzufügen</DialogTitle>
						</DialogHeader>
						<div className="grid gap-4 py-2">
							<div className="grid gap-1.5">
								<Label htmlFor="ext-creditor">Gläubiger</Label>
								<Input
									id="ext-creditor"
									placeholder="z. B. Getränke Hartmann"
									value={creditor}
									onChange={(e) => setCreditor(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="ext-description">Beschreibung</Label>
								<Input
									id="ext-description"
									placeholder="z. B. Lieferung April"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="ext-amount">Betrag (€)</Label>
								<Input
									id="ext-amount"
									inputMode="decimal"
									placeholder="0,00"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button onClick={handleAdd} disabled={isPending}>
								Hinzufügen
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			}
		>
			{bills.length === 0 ? (
				<EmptyState
					variant="plain"
					className="py-6"
					icon={<FileCheck />}
					title="Keine Verbindlichkeiten"
				/>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Gläubiger</TableHead>
							<TableHead className="hidden sm:table-cell">
								Beschreibung
							</TableHead>
							<TableHead className="text-right">Betrag</TableHead>
							<TableHead>Status</TableHead>
							<TableHead />
						</TableRow>
					</TableHeader>
					<TableBody>
						{[...openBills, ...paidBills].map((b) => (
							<TableRow
								key={b.id}
								className={
									b.status === "Bezahlt" ? "text-muted-foreground" : ""
								}
							>
								<TableCell className="font-medium text-sm">
									{b.creditor}
								</TableCell>
								<TableCell className="hidden text-sm sm:table-cell">
									{b.description}
								</TableCell>
								<TableCell className="text-right font-semibold text-sm">
									{formatEUR(b.amount)}
								</TableCell>
								<TableCell>
									<BillStatusBadge status={b.status} />
								</TableCell>
								<TableCell>
									<div className="flex gap-1">
										{b.status === "Offen" && (
											<IconButton
												label={`${b.creditor} als bezahlt markieren`}
												disabled={isPending}
												onClick={() => handlePaid(b.id)}
											>
												<CheckCircle className="text-success" />
											</IconButton>
										)}
										<ConfirmAction
											title="Verbindlichkeit löschen?"
											description={`${b.creditor}: ${b.description} (${formatEUR(b.amount)}) wird gelöscht. Das lässt sich nicht rückgängig machen.`}
											onConfirm={() => handleDelete(b.id)}
										>
											<IconButton
												label={`Verbindlichkeit ${b.creditor} löschen`}
												disabled={isPending}
											>
												<Trash2 className="text-destructive" />
											</IconButton>
										</ConfirmAction>
									</div>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</CollapsibleCard>
	);
}
