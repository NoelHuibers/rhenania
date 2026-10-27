"use client";

import {
	ArrowDownCircle,
	ArrowUpCircle,
	Landmark,
	Plus,
	Trash2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import { parseDecimalInput } from "~/lib/decimal";
import { formatDate, formatEUR } from "~/lib/format";
import {
	addBankEntry,
	deleteBankEntry,
} from "~/server/actions/getraenkewart/kasse";
import type { BankEntry } from "./types";

/** Kassenstandverlauf: bank balance history with add and delete. */
export function BankLog({ entries }: { entries: BankEntry[] }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [isPending, startTransition] = useTransition();

	const balance = entries.reduce((s, e) => s + e.amount, 0);

	const parsedKontostand = parseDecimalInput(amount);
	const diff = Number.isNaN(parsedKontostand)
		? null
		: parsedKontostand - balance;

	function handleAdd() {
		if (diff === null || !description.trim()) {
			return;
		}
		startTransition(async () => {
			const res = await addBankEntry({
				amount: diff,
				description: description.trim(),
				date: new Date(date),
			});
			if (res.success) {
				toast.success("Eintrag hinzugefügt");
				setOpen(false);
				setAmount("");
				setDescription("");
				router.refresh();
			} else {
				toast.error("Fehler beim Hinzufügen");
			}
		});
	}

	function handleDelete(id: string) {
		startTransition(async () => {
			const res = await deleteBankEntry(id);
			if (res.success) {
				toast.success("Eintrag gelöscht");
				router.refresh();
			} else {
				toast.error(res.error ?? "Fehler beim Löschen");
			}
		});
	}

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-base">Kassenstandverlauf</CardTitle>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button size="sm" variant="outline">
							<Plus className="mr-1 size-4" />
							Eintrag
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Kasseneintrag hinzufügen</DialogTitle>
						</DialogHeader>
						<div className="grid gap-4 py-2">
							<div className="grid gap-1.5">
								<Label htmlFor="bank-balance">Aktueller Kontostand (€)</Label>
								<Input
									id="bank-balance"
									inputMode="decimal"
									placeholder="z. B. 1250,00"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
								/>
								<p className="text-muted-foreground text-xs">
									Differenz zum letzten Stand ({formatEUR(balance)}):{" "}
									{diff === null ? (
										"—"
									) : (
										<span
											className={
												diff >= 0
													? "font-medium text-success"
													: "font-medium text-destructive"
											}
										>
											{formatEUR(diff, { signed: true })}
										</span>
									)}
								</p>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="bank-description">Beschreibung</Label>
								<Input
									id="bank-description"
									placeholder="z. B. Kontostand 04.04."
									value={description}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label htmlFor="bank-date">Datum</Label>
								<Input
									id="bank-date"
									type="date"
									value={date}
									onChange={(e) => setDate(e.target.value)}
								/>
							</div>
						</div>
						<DialogFooter>
							<Button
								onClick={handleAdd}
								disabled={isPending || diff === null || !description.trim()}
							>
								Hinzufügen
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardHeader>
			<CardContent className="p-0">
				{entries.length === 0 ? (
					<EmptyState
						variant="plain"
						className="py-6"
						icon={<Landmark />}
						title="Noch keine Einträge"
					/>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead className="hidden sm:table-cell">Datum</TableHead>
								<TableHead>Beschreibung</TableHead>
								<TableHead className="text-right">Betrag</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.map((e) => (
								<TableRow key={e.id}>
									<TableCell className="hidden text-sm sm:table-cell">
										{formatDate(e.date)}
									</TableCell>
									<TableCell className="text-sm">{e.description}</TableCell>
									<TableCell className="text-right font-medium text-sm">
										<span
											className={
												e.amount >= 0 ? "text-success" : "text-destructive"
											}
										>
											{e.amount >= 0 ? (
												<ArrowUpCircle className="mr-1 inline size-3.5" />
											) : (
												<ArrowDownCircle className="mr-1 inline size-3.5" />
											)}
											{formatEUR(e.amount)}
										</span>
									</TableCell>
									<TableCell>
										<ConfirmAction
											title="Kasseneintrag löschen?"
											description={`„${e.description}“ (${formatEUR(e.amount)}) wird aus dem Kassenstandverlauf entfernt. Das lässt sich nicht rückgängig machen.`}
											onConfirm={() => handleDelete(e.id)}
										>
											<IconButton
												label={`Eintrag „${e.description}“ löschen`}
												disabled={isPending}
											>
												<Trash2 className="text-destructive" />
											</IconButton>
										</ConfirmAction>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
						<TableFooter>
							<TableRow>
								<TableCell colSpan={1} className="font-semibold sm:hidden">
									Aktueller Stand
								</TableCell>
								<TableCell
									colSpan={2}
									className="hidden font-semibold sm:table-cell"
								>
									Aktueller Stand
								</TableCell>
								<TableCell
									className={`text-right font-bold ${balance >= 0 ? "text-success" : "text-destructive"}`}
								>
									{formatEUR(balance)}
								</TableCell>
								<TableCell />
							</TableRow>
						</TableFooter>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}
