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
	Loader2,
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
import { GetraenkeSettingsCard } from "~/components/getraenkewart/GetraenkeSettingsCard";
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
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "~/components/ui/collapsible";
import { ConfirmAction } from "~/components/ui/confirm-action";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "~/components/ui/dropdown-menu";
import { IconButton } from "~/components/ui/icon-button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	BillStatusBadge,
	StatusBadge,
	statusClass,
} from "~/components/ui/status-badge";
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
import { formatDate, formatDecimalInput, formatEUR } from "~/lib/format";
import { billStatusStyle } from "~/lib/status";
import {
	createNewBilling,
	updateBillStatus,
} from "~/server/actions/billings/billings";
import {
	addBankEntry,
	addExternalBill,
	deleteBankEntry,
	deleteExternalBill,
	downloadEntityBillPDF,
	type GetraenkeSettings,
	markAllMemberBillsPaid,
	markExternalBillPaid,
	setPfandWert,
} from "~/server/actions/getraenkewart/kasse";

// ─── Types ────────────────────────────────────────────────────────────────────

type Summary = {
	kassenstand: number;
	lagerwert: number;
	lagerwertDate: Date | null;
	offeneMitglieder: number;
	gestundetMitglieder: number;
	offeneGruppen: number;
	gestundetGruppen: number;
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
	/** Feature settings; null for tenants without markup / treasurer features. */
	settings?: GetraenkeSettings | null;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
	const [pfandInput, setPfandInput] = useState(formatDecimalInput(pfandWert));
	const [isPending, startTransition] = useTransition();

	function handleSavePfand() {
		const parsed = parseDecimalInput(pfandInput);
		if (Number.isNaN(parsed)) {
			return;
		}
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

	const supportingCards: Array<{
		label: string;
		value: string;
		icon: typeof Euro;
		color: string;
		sub?: string;
		/** Shown after the value: what the amount is ("fällig"). */
		qualifier?: string;
		/** Gestundet amount, shown as its own line; omitted when undefined. */
		deferred?: number;
	}> = [
		{
			label: "Kassenstand",
			value: formatEUR(summary.kassenstand),
			icon: Euro,
			color: "text-info",
		},
		{
			label: "Lagerwert",
			value: formatEUR(summary.lagerwert),
			icon: Warehouse,
			sub: summary.lagerwertDate
				? `Letzte Inventur: ${formatDate(summary.lagerwertDate)}`
				: "Keine Inventur",
			color: "text-warning-muted-foreground",
		},
		{
			label: "Offene Mitgliederrechnungen",
			value: formatEUR(summary.offeneMitglieder),
			qualifier: "fällig",
			deferred: summary.gestundetMitglieder,
			icon: Users,
			color: "text-warning-muted-foreground",
		},
		{
			label: "Offene Gruppenrechnungen",
			value: formatEUR(summary.offeneGruppen),
			// Rare for groups: only shown when there is something deferred.
			...(summary.gestundetGruppen > 0
				? { qualifier: "fällig", deferred: summary.gestundetGruppen }
				: {}),
			icon: Receipt,
			color: "text-purple-600",
		},
		{
			label: "Externe Verbindlichkeiten",
			value: formatEUR(summary.externOffen),
			icon: Building2,
			color: "text-destructive",
		},
	];

	const gesamtColor = summary.gesamt >= 0 ? "text-success" : "text-destructive";

	return (
		<div className="flex flex-col gap-3">
			{/* Hero: Gesamtvermögen */}
			<Card className="border-primary">
				<CardContent className="flex items-center justify-between p-5">
					<div>
						<p className="text-muted-foreground text-sm">Gesamtvermögen</p>
						<p className={`font-bold text-3xl ${gesamtColor}`}>
							{formatEUR(summary.gesamt)}
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
									<p className={`font-bold text-lg ${c.color}`}>
										{c.value}
										{c.qualifier && (
											<span className="ml-1.5 font-normal text-muted-foreground text-xs">
												{c.qualifier}
											</span>
										)}
									</p>
									{c.deferred !== undefined && (
										<p className="mt-1 flex items-center gap-1.5 text-xs">
											<StatusBadge {...billStatusStyle("Gestundet")}>
												Gestundet
											</StatusBadge>
											<span className="font-semibold">
												{formatEUR(c.deferred)}
											</span>
										</p>
									)}
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
						<Package className="size-5 shrink-0 text-success" />
						<div className="min-w-0 flex-1">
							<p className="text-muted-foreground text-xs">Pfandguthaben</p>
							{editingPfand ? (
								<div className="mt-1 flex items-center gap-2">
									<Input
										inputMode="decimal"
										value={pfandInput}
										onChange={(e) => setPfandInput(e.target.value)}
										className="h-8 w-28 text-sm"
										placeholder="0,00"
										aria-label="Pfandwert in Euro"
										autoFocus
										onKeyDown={(e) => {
											if (e.key === "Enter") {
												handleSavePfand();
											}
											if (e.key === "Escape") {
												setEditingPfand(false);
											}
										}}
									/>
									<IconButton
										label="Pfandwert speichern"
										size="icon-sm"
										onClick={handleSavePfand}
										disabled={isPending}
									>
										<CheckCircle className="text-success" />
									</IconButton>
									<IconButton
										label="Bearbeiten abbrechen"
										size="icon-sm"
										onClick={() => setEditingPfand(false)}
										disabled={isPending}
									>
										<X />
									</IconButton>
								</div>
							) : (
								<div className="flex items-center gap-2">
									<p className="font-bold text-lg text-success">
										{formatEUR(summary.pfand)}
									</p>
									<IconButton
										label="Pfandwert bearbeiten"
										size="icon-sm"
										onClick={() => setEditingPfand(true)}
									>
										<Pencil className="text-muted-foreground" />
									</IconButton>
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
				<CardHeader className="flex flex-row items-center justify-between gap-2 transition-colors hover:bg-muted/50">
					{/* The title is the toggle (a real button, so it works with the
					    keyboard); the chevron repeats it for the mouse only. */}
					<CollapsibleTrigger className="-m-1 flex min-h-9 flex-1 cursor-pointer items-center gap-2 rounded-md p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
						<span className="font-heading font-medium text-base">{title}</span>
						{meta}
					</CollapsibleTrigger>
					<div className="flex items-center gap-2">
						{action}
						<CollapsibleTrigger
							tabIndex={-1}
							aria-hidden
							className="inline-flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-muted"
						>
							{open ? (
								<ChevronUp className="size-4" />
							) : (
								<ChevronDown className="size-4" />
							)}
						</CollapsibleTrigger>
					</div>
				</CardHeader>
				<CollapsibleContent>
					<CardContent className="p-0">{children}</CardContent>
				</CollapsibleContent>
			</Collapsible>
		</Card>
	);
}

// ─── Member Bills ─────────────────────────────────────────────────────────────

type BillStatus = "Bezahlt" | "Unbezahlt" | "Gestundet";

function billStatusClass(status: string) {
	return statusClass(billStatusStyle(status));
}

function MemberBillsCard({ bills }: { bills: MemberBill[] }) {
	const router = useRouter();
	const [isPending, startTransition] = useTransition();
	const [pendingId, setPendingId] = useState<string | null>(null);
	const markAllPaidEnabled = useFeature("billing.markAllPaid");
	const total = bills.reduce((s, b) => s + b.total, 0);

	function setStatus(id: string, name: string, status: BillStatus) {
		setPendingId(id);
		startTransition(async () => {
			const res = await updateBillStatus(id, status);
			if (res.success) {
				toast.success(
					status === "Bezahlt"
						? `${name} als bezahlt markiert`
						: status === "Gestundet"
							? `${name} gestundet`
							: `${name} auf unbezahlt gesetzt`,
				);
				router.refresh();
			} else {
				toast.error("Status konnte nicht geändert werden");
			}
			setPendingId(null);
		});
	}

	function markAllPaid() {
		startTransition(async () => {
			const res = await markAllMemberBillsPaid();
			if (res.success) {
				toast.success(`${res.count} Rechnungen als bezahlt markiert`);
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
				markAllPaidEnabled && bills.length > 0 ? (
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
									{bills.length} offene Mitgliederrechnungen über insgesamt{" "}
									{formatEUR(total)} werden auf „Bezahlt" gesetzt, auch
									gestundete. Gruppenrechnungen bleiben unverändert.
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
				<p className="p-4 text-muted-foreground text-sm">
					Keine offenen Rechnungen.
				</p>
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

// ─── Entity Bills ─────────────────────────────────────────────────────────────

function EntityBillsCard({ bills }: { bills: EntityBill[] }) {
	const router = useRouter();
	const [downloading, setDownloading] = useState<string | null>(null);
	const [pendingId, setPendingId] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function setStatus(id: string, name: string, status: BillStatus) {
		setPendingId(id);
		startTransition(async () => {
			const res = await updateBillStatus(id, status);
			if (res.success) {
				toast.success(
					status === "Bezahlt"
						? `${name} als bezahlt markiert`
						: status === "Gestundet"
							? `${name} gestundet`
							: `${name} auf unbezahlt gesetzt`,
				);
				router.refresh();
			} else {
				toast.error("Status konnte nicht geändert werden");
			}
			setPendingId(null);
		});
	}

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

// ─── External Bills ───────────────────────────────────────────────────────────

function ExternalBillsCard({ bills }: { bills: ExternalBill[] }) {
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

// ─── Neue Rechnung ────────────────────────────────────────────────────────────

function NeueRechnungCard() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleCreate() {
		startTransition(async () => {
			setOpen(false);
			const result = await createNewBilling();
			if (result?.success) {
				toast.success("Neue Rechnung erfolgreich erstellt");
				router.refresh();
			} else {
				toast.error("Fehler beim Erstellen der Rechnung");
			}
		});
	}

	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="font-semibold">Neue Rechnung</p>
					<p className="text-muted-foreground text-sm">
						Aktuelle Bestellungen abrechnen
					</p>
				</div>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button disabled={isPending}>
							<Plus className="mr-2 size-4" />
							Erstellen
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Neue Rechnung erstellen</DialogTitle>
							<DialogDescription>
								Diese Aktion kann nicht rückgängig gemacht werden. Sind Sie sich
								sicher, dass Sie eine neue Abrechnungsperiode erstellen möchten?
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setOpen(false)}
								disabled={isPending}
							>
								Abbrechen
							</Button>
							<Button onClick={handleCreate} disabled={isPending}>
								{isPending ? (
									<>
										<Loader2 className="mr-2 size-4 animate-spin" />
										Erstelle...
									</>
								) : (
									"Ja, erstellen"
								)}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}

// ─── KasseTab ─────────────────────────────────────────────────────────────────

export function KasseTab({
	summary,
	bankEntries,
	externalBills,
	entityBills,
	memberBills,
	pfandWert,
	settings = null,
}: Props) {
	return (
		<div className="flex flex-col gap-6">
			<SummarySection summary={summary} pfandWert={pfandWert} />
			{settings && <GetraenkeSettingsCard settings={settings} />}
			<NeueRechnungCard />
			<BankLog entries={bankEntries} />
			<MemberBillsCard bills={memberBills} />
			<EntityBillsCard bills={entityBills} />
			<ExternalBillsCard bills={externalBills} />
		</div>
	);
}
