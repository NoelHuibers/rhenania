"use client";

import {
	ArrowDownCircle,
	ArrowUpCircle,
	Building2,
	CheckCircle,
	ChevronDown,
	ChevronUp,
	Download,
	Euro,
	Package,
	Pencil,
	Plus,
	Receipt,
	Trash2,
	Users,
	Warehouse,
	X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import {
	Dialog,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
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
import {
	addBankEntry,
	addExternalBill,
	deleteBankEntry,
	deleteExternalBill,
	downloadEntityBillPDF,
	markExternalBillPaid,
	setPfandWert,
} from "~/server/actions/getraenkewart/kasse";

// ─── Types ────────────────────────────────────────────────────────────────────

type Summary = {
	kassenstand: number;
	lagerwert: number;
	lagerwertDate: Date | null;
	offeneMitglieder: number;
	offeneGruppen: number;
	pfand: number;
	externOffen: number;
	gesamt: number;
};

type BankEntry = {
	id: string;
	amount: number;
	description: string;
	date: Date;
	createdAt: Date;
};

type ExternalBill = {
	id: string;
	creditor: string;
	description: string;
	amount: number;
	status: "Offen" | "Bezahlt";
	paidAt: Date | null;
	createdAt: Date;
};

type EntityBill = {
	id: string;
	userName: string;
	total: number;
	status: string;
	createdAt: Date;
	items: {
		drinkName: string;
		amount: number;
		pricePerDrink: number;
		totalPricePerDrink: number;
	}[];
};

type MemberBill = {
	id: string;
	userName: string;
	total: number;
	status: string;
	createdAt: Date;
};

type Props = {
	summary: Summary;
	bankEntries: BankEntry[];
	externalBills: ExternalBill[];
	entityBills: EntityBill[];
	memberBills: MemberBill[];
	pfandWert: number;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(amount: number) {
	return `${amount.toFixed(2).replace(".", ",")} €`;
}

function fmtDate(date: Date | null) {
	if (!date) return "—";
	return new Date(date).toLocaleDateString("de-DE");
}

// ─── Summary ──────────────────────────────────────────────────────────────────

function SummarySection({
	summary,
	pfandWert,
}: {
	summary: Summary;
	pfandWert: number;
}) {
	const router = useRouter();
	const [editingPfand, setEditingPfand] = useState(false);
	const [pfandInput, setPfandInput] = useState(
		pfandWert.toFixed(2).replace(".", ","),
	);
	const [isPending, startTransition] = useTransition();

	function handleSavePfand() {
		const parsed = Number.parseFloat(pfandInput.replace(",", "."));
		if (Number.isNaN(parsed)) return;
		startTransition(async () => {
			const res = await setPfandWert(parsed);
			if (res.success) {
				toast.success("Pfandwert gespeichert");
				setEditingPfand(false);
				router.refresh();
			} else {
				toast.error("Fehler beim Speichern");
			}
		});
	}

	const supportingCards = [
		{
			label: "Kassenstand",
			value: fmt(summary.kassenstand),
			icon: Euro,
			color: "text-blue-600",
		},
		{
			label: "Lagerwert",
			value: fmt(summary.lagerwert),
			icon: Warehouse,
			sub: summary.lagerwertDate
				? `Letzte Inventur: ${fmtDate(summary.lagerwertDate)}`
				: "Keine Inventur",
			color: "text-orange-500",
		},
		{
			label: "Offene Mitgliederrechnungen",
			value: fmt(summary.offeneMitglieder),
			icon: Users,
			color: "text-yellow-600",
		},
		{
			label: "Offene Gruppenrechnungen",
			value: fmt(summary.offeneGruppen),
			icon: Receipt,
			color: "text-purple-600",
		},
		{
			label: "Externe Verbindlichkeiten",
			value: fmt(summary.externOffen),
			icon: Building2,
			color: "text-red-600",
		},
	];

	const gesamtColor = summary.gesamt >= 0 ? "text-green-600" : "text-red-600";

	return (
		<div className="flex flex-col gap-3">
			{/* Hero: Gesamtvermögen */}
			<Card className="border-primary">
				<CardContent className="flex items-center justify-between p-5">
					<div>
						<p className="text-muted-foreground text-sm">Gesamtvermögen</p>
						<p className={`font-bold text-3xl ${gesamtColor}`}>
							{fmt(summary.gesamt)}
						</p>
					</div>
					<Euro className={`size-10 ${gesamtColor}`} />
				</CardContent>
			</Card>

			{/* Supporting cards */}
			<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{supportingCards.map((c) => {
					const Icon = c.icon;
					return (
						<Card key={c.label}>
							<CardContent className="flex items-center gap-3 p-4">
								<Icon className={`size-5 shrink-0 ${c.color}`} />
								<div className="min-w-0">
									<p className="text-muted-foreground text-xs">{c.label}</p>
									<p className={`font-bold text-lg ${c.color}`}>{c.value}</p>
									{c.sub && (
										<p className="text-muted-foreground text-xs">{c.sub}</p>
									)}
								</div>
							</CardContent>
						</Card>
					);
				})}

				{/* Pfand card — inline editable */}
				<Card>
					<CardContent className="flex items-center gap-3 p-4">
						<Package className="size-5 shrink-0 text-green-600" />
						<div className="min-w-0 flex-1">
							<p className="text-muted-foreground text-xs">Pfandguthaben</p>
							{editingPfand ? (
								<div className="mt-1 flex items-center gap-2">
									<Input
										value={pfandInput}
										onChange={(e) => setPfandInput(e.target.value)}
										className="h-7 w-28 text-sm"
										placeholder="0,00"
										autoFocus
										onKeyDown={(e) => {
											if (e.key === "Enter") handleSavePfand();
											if (e.key === "Escape") setEditingPfand(false);
										}}
									/>
									<Button
										size="icon"
										variant="ghost"
										className="size-6"
										onClick={handleSavePfand}
										disabled={isPending}
									>
										<CheckCircle className="size-3.5 text-green-600" />
									</Button>
									<Button
										size="icon"
										variant="ghost"
										className="size-6"
										onClick={() => setEditingPfand(false)}
										disabled={isPending}
									>
										<X className="size-3.5" />
									</Button>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<p className="font-bold text-green-600 text-lg">
										{fmt(summary.pfand)}
									</p>
									<Button
										size="icon"
										variant="ghost"
										className="size-6"
										onClick={() => setEditingPfand(true)}
									>
										<Pencil className="size-3 text-muted-foreground" />
									</Button>
								</div>
							)}
						</div>
					</CardContent>
				</Card>
			</div>
		</div>
	);
}

// ─── Bank Log ─────────────────────────────────────────────────────────────────

function BankLog({ entries }: { entries: BankEntry[] }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [amount, setAmount] = useState("");
	const [description, setDescription] = useState("");
	const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
	const [isPending, startTransition] = useTransition();

	function handleAdd() {
		const parsed = Number.parseFloat(amount.replace(",", "."));
		if (Number.isNaN(parsed) || !description.trim()) return;
		startTransition(async () => {
			const res = await addBankEntry({
				amount: parsed,
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
				toast.error("Fehler beim Löschen");
			}
		});
	}

	const balance = entries.reduce((s, e) => s + e.amount, 0);

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
								<Label>Betrag (negativ = Ausgabe)</Label>
								<Input
									placeholder="z. B. 150 oder -25,50"
									value={amount}
									onChange={(e) => setAmount(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>Beschreibung</Label>
								<Input
									placeholder="z. B. Kontostand 04.04."
									value={description}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>Datum</Label>
								<Input
									type="date"
									value={date}
									onChange={(e) => setDate(e.target.value)}
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
			</CardHeader>
			<CardContent className="p-0">
				{entries.length === 0 ? (
					<p className="p-4 text-muted-foreground text-sm">
						Noch keine Einträge.
					</p>
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
										{fmtDate(e.date)}
									</TableCell>
									<TableCell className="text-sm">{e.description}</TableCell>
									<TableCell className="text-right font-medium text-sm">
										<span
											className={
												e.amount >= 0 ? "text-green-600" : "text-red-600"
											}
										>
											{e.amount >= 0 ? (
												<ArrowUpCircle className="mr-1 inline size-3.5" />
											) : (
												<ArrowDownCircle className="mr-1 inline size-3.5" />
											)}
											{fmt(e.amount)}
										</span>
									</TableCell>
									<TableCell>
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											disabled={isPending}
											onClick={() => handleDelete(e.id)}
										>
											<Trash2 className="size-3.5 text-red-500" />
										</Button>
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
									className={`text-right font-bold ${balance >= 0 ? "text-green-600" : "text-red-600"}`}
								>
									{fmt(balance)}
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

// ─── Collapsible bill card shell ──────────────────────────────────────────────

function CollapsibleCard({
	title,
	meta,
	action,
	children,
	defaultOpen = true,
}: {
	title: string;
	meta?: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
	defaultOpen?: boolean;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<Card>
			<Collapsible open={open} onOpenChange={setOpen}>
				<CollapsibleTrigger asChild>
					<CardHeader className="flex cursor-pointer flex-row items-center justify-between transition-colors hover:bg-muted/50">
						<div className="flex items-center gap-2">
							<CardTitle className="text-base">{title}</CardTitle>
							{meta}
						</div>
						<div className="flex items-center gap-2">
							{action}
							<Button
								variant="ghost"
								size="icon"
								className="size-7"
								tabIndex={-1}
							>
								{open ? (
									<ChevronUp className="size-4" />
								) : (
									<ChevronDown className="size-4" />
								)}
							</Button>
						</div>
					</CardHeader>
				</CollapsibleTrigger>
				<CollapsibleContent>
					<CardContent className="p-0">{children}</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}

// ─── Member Bills ─────────────────────────────────────────────────────────────

function MemberBillsCard({ bills }: { bills: MemberBill[] }) {
	const total = bills.reduce((s, b) => s + b.total, 0);

	return (
		<CollapsibleCard
			title="Offene Mitgliederrechnungen"
			meta={
				bills.length > 0 ? (
					<span className="text-muted-foreground text-xs">
						{bills.length} • {fmt(total)}
					</span>
				) : undefined
			}
		>
			{bills.length === 0 ? (
				<p className="p-4 text-muted-foreground text-sm">
					Keine offenen Rechnungen.
				</p>
			) : (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Mitglied</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="text-right">Betrag</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{bills.map((b) => (
							<TableRow key={b.id}>
								<TableCell className="font-medium text-sm">
									{b.userName}
								</TableCell>
								<TableCell>
									<Badge
										variant={
											b.status === "Gestundet" ? "secondary" : "destructive"
										}
									>
										{b.status}
									</Badge>
								</TableCell>
								<TableCell className="text-right font-semibold text-sm">
									{fmt(b.total)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={2} className="font-semibold">
								Gesamt
							</TableCell>
							<TableCell className="text-right font-bold">
								{fmt(total)}
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
			)}
		</CollapsibleCard>
	);
}

// ─── Entity Bills ─────────────────────────────────────────────────────────────

function EntityBillsCard({ bills }: { bills: EntityBill[] }) {
	const [downloading, setDownloading] = useState<string | null>(null);

	async function handleDownload(bill: EntityBill) {
		setDownloading(bill.id);
		try {
			const res = await downloadEntityBillPDF(bill.id);
			if (!res.success || !res.base64) {
				toast.error(res.error ?? "PDF-Fehler");
				return;
			}
			const bytes = Uint8Array.from(atob(res.base64), (c) => c.charCodeAt(0));
			const blob = new Blob([bytes], { type: "application/pdf" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = res.fileName ?? `Rechnung_${bill.userName}.pdf`;
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
				<p className="p-4 text-muted-foreground text-sm">
					Keine Gruppenrechnungen vorhanden.
				</p>
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
								className={b.status !== "Unbezahlt" ? "opacity-50" : ""}
							>
								<TableCell className="font-medium text-sm">
									{b.userName}
								</TableCell>
								<TableCell className="hidden text-sm sm:table-cell">
									{fmtDate(b.createdAt)}
								</TableCell>
								<TableCell>
									<Badge
										variant={
											b.status === "Bezahlt" ? "secondary" : "destructive"
										}
									>
										{b.status}
									</Badge>
								</TableCell>
								<TableCell className="text-right font-semibold text-sm">
									{fmt(b.total)}
								</TableCell>
								<TableCell>
									<Button
										size="icon"
										variant="ghost"
										className="size-7"
										disabled={downloading === b.id}
										onClick={() => handleDownload(b)}
										aria-label={`PDF für ${b.userName} herunterladen`}
									>
										<Download className="size-3.5" />
									</Button>
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			)}
		</CollapsibleCard>
	);
}

// ─── External Bills ───────────────────────────────────────────────────────────

function ExternalBillsCard({ bills }: { bills: ExternalBill[] }) {
	const router = useRouter();
	const [dialogOpen, setDialogOpen] = useState(false);
	const [creditor, setCreditor] = useState("");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleAdd() {
		const parsed = Number.parseFloat(amount.replace(",", "."));
		if (Number.isNaN(parsed) || !creditor.trim() || !description.trim()) return;
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
			}
		});
	}

	function handleDelete(id: string) {
		startTransition(async () => {
			const res = await deleteExternalBill(id);
			if (res.success) {
				toast.success("Gelöscht");
				router.refresh();
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
						{openBills.length} offen • {fmt(openTotal)}
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
								<Label>Gläubiger</Label>
								<Input
									placeholder="z. B. Getränke Hartmann"
									value={creditor}
									onChange={(e) => setCreditor(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>Beschreibung</Label>
								<Input
									placeholder="z. B. Lieferung April"
									value={description}
									onChange={(e) => setDescription(e.target.value)}
								/>
							</div>
							<div className="grid gap-1.5">
								<Label>Betrag (€)</Label>
								<Input
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
				<p className="p-4 text-muted-foreground text-sm">
					Keine Verbindlichkeiten.
				</p>
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
								className={b.status === "Bezahlt" ? "opacity-50" : ""}
							>
								<TableCell className="font-medium text-sm">
									{b.creditor}
								</TableCell>
								<TableCell className="hidden text-sm sm:table-cell">
									{b.description}
								</TableCell>
								<TableCell className="text-right font-semibold text-sm">
									{fmt(b.amount)}
								</TableCell>
								<TableCell>
									<Badge
										variant={
											b.status === "Bezahlt" ? "secondary" : "destructive"
										}
									>
										{b.status}
									</Badge>
								</TableCell>
								<TableCell>
									<div className="flex gap-1">
										{b.status === "Offen" && (
											<Button
												variant="ghost"
												size="icon"
												className="size-7"
												disabled={isPending}
												onClick={() => handlePaid(b.id)}
												aria-label="Als bezahlt markieren"
											>
												<CheckCircle className="size-3.5 text-green-500" />
											</Button>
										)}
										<Button
											variant="ghost"
											size="icon"
											className="size-7"
											disabled={isPending}
											onClick={() => handleDelete(b.id)}
											aria-label="Löschen"
										>
											<Trash2 className="size-3.5 text-red-500" />
										</Button>
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

// ─── KasseTab ─────────────────────────────────────────────────────────────────

export default function KasseTab({
	summary,
	bankEntries,
	externalBills,
	entityBills,
	memberBills,
	pfandWert,
}: Props) {
	return (
		<div className="flex flex-col gap-6">
			<SummarySection summary={summary} pfandWert={pfandWert} />
			<BankLog entries={bankEntries} />
			<MemberBillsCard bills={memberBills} />
			<EntityBillsCard bills={entityBills} />
			<ExternalBillsCard bills={externalBills} />
		</div>
	);
}
