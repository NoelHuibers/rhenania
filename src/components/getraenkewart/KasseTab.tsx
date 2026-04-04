"use client";

import {
	ArrowDownCircle,
	ArrowUpCircle,
	Building2,
	CheckCircle,
	Euro,
	Package,
	Plus,
	Receipt,
	Trash2,
	Users,
	Warehouse,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
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
	items: { drinkName: string; amount: number; pricePerDrink: number; totalPricePerDrink: number }[];
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

// ─── Summary Cards ────────────────────────────────────────────────────────────

function SummaryCards({ summary }: { summary: Summary }) {
	const cards = [
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
			sub: summary.lagerwertDate ? `Letzte Inventur: ${fmtDate(summary.lagerwertDate)}` : "Keine Inventur",
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
			label: "Pfandguthaben",
			value: fmt(summary.pfand),
			icon: Package,
			color: "text-green-600",
		},
		{
			label: "Externe Verbindlichkeiten",
			value: fmt(summary.externOffen),
			icon: Building2,
			color: "text-red-600",
		},
		{
			label: "Gesamtvermögen",
			value: fmt(summary.gesamt),
			icon: Euro,
			color: summary.gesamt >= 0 ? "text-green-600" : "text-red-600",
			highlight: true,
		},
	];

	return (
		<div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
			{cards.map((c) => {
				const Icon = c.icon;
				return (
					<Card key={c.label} className={c.highlight ? "border-primary col-span-full lg:col-span-4" : ""}>
						<CardContent className="flex items-center gap-4 p-4">
							<Icon className={`size-8 shrink-0 ${c.color}`} />
							<div className="min-w-0">
								<p className="text-muted-foreground text-xs">{c.label}</p>
								<p className={`text-xl font-bold ${c.color}`}>{c.value}</p>
								{c.sub && <p className="text-muted-foreground text-xs">{c.sub}</p>}
							</div>
						</CardContent>
					</Card>
				);
			})}
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
			const res = await addBankEntry({ amount: parsed, description: description.trim(), date: new Date(date) });
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
								<Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
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
					<p className="text-muted-foreground p-4 text-sm">Noch keine Einträge.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Datum</TableHead>
								<TableHead>Beschreibung</TableHead>
								<TableHead className="text-right">Betrag</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{entries.map((e) => (
								<TableRow key={e.id}>
									<TableCell className="text-sm">{fmtDate(e.date)}</TableCell>
									<TableCell className="text-sm">{e.description}</TableCell>
									<TableCell className="text-right text-sm font-medium">
										<span className={e.amount >= 0 ? "text-green-600" : "text-red-600"}>
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
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

// ─── Pfand ────────────────────────────────────────────────────────────────────

function PfandCard({ initial }: { initial: number }) {
	const router = useRouter();
	const [value, setValue] = useState(initial.toFixed(2).replace(".", ","));
	const [isPending, startTransition] = useTransition();

	function handleSave() {
		const parsed = Number.parseFloat(value.replace(",", "."));
		if (Number.isNaN(parsed)) return;
		startTransition(async () => {
			const res = await setPfandWert(parsed);
			if (res.success) {
				toast.success("Pfandwert gespeichert");
				router.refresh();
			} else {
				toast.error("Fehler beim Speichern");
			}
		});
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Pfandguthaben</CardTitle>
			</CardHeader>
			<CardContent className="flex items-end gap-3">
				<div className="grid flex-1 gap-1.5">
					<Label>Pfandwert (€)</Label>
					<Input
						value={value}
						onChange={(e) => setValue(e.target.value)}
						placeholder="0,00"
					/>
				</div>
				<Button onClick={handleSave} disabled={isPending}>
					Speichern
				</Button>
			</CardContent>
		</Card>
	);
}

// ─── Open Member Bills ────────────────────────────────────────────────────────

function MemberBillsCard({ bills }: { bills: MemberBill[] }) {
	const total = bills.reduce((s, b) => s + b.total, 0);

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Offene Mitgliederrechnungen</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{bills.length === 0 ? (
					<p className="text-muted-foreground p-4 text-sm">Keine offenen Rechnungen.</p>
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
									<TableCell className="text-sm font-medium">{b.userName}</TableCell>
									<TableCell>
										<Badge variant={b.status === "Gestundet" ? "secondary" : "destructive"}>
											{b.status}
										</Badge>
									</TableCell>
									<TableCell className="text-right text-sm font-semibold">{fmt(b.total)}</TableCell>
								</TableRow>
							))}
							<TableRow className="bg-muted/50 font-bold">
								<TableCell colSpan={2}>Gesamt</TableCell>
								<TableCell className="text-right">{fmt(total)}</TableCell>
							</TableRow>
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

// ─── Entity Bills with PDF ────────────────────────────────────────────────────

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

	const open = bills.filter((b) => b.status === "Unbezahlt");
	const paid = bills.filter((b) => b.status !== "Unbezahlt");

	return (
		<Card>
			<CardHeader>
				<CardTitle className="text-base">Gruppenrechnungen</CardTitle>
			</CardHeader>
			<CardContent className="p-0">
				{bills.length === 0 ? (
					<p className="text-muted-foreground p-4 text-sm">Keine Gruppenrechnungen vorhanden.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Gruppe</TableHead>
								<TableHead>Datum</TableHead>
								<TableHead>Status</TableHead>
								<TableHead className="text-right">Betrag</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...open, ...paid].map((b) => (
								<TableRow key={b.id} className={b.status !== "Unbezahlt" ? "opacity-50" : ""}>
									<TableCell className="text-sm font-medium">{b.userName}</TableCell>
									<TableCell className="text-sm">{fmtDate(b.createdAt)}</TableCell>
									<TableCell>
										<Badge variant={b.status === "Bezahlt" ? "secondary" : "destructive"}>
											{b.status}
										</Badge>
									</TableCell>
									<TableCell className="text-right text-sm font-semibold">{fmt(b.total)}</TableCell>
									<TableCell>
										<Button
											size="sm"
											variant="outline"
											disabled={downloading === b.id}
											onClick={() => handleDownload(b)}
										>
											PDF
										</Button>
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				)}
			</CardContent>
		</Card>
	);
}

// ─── External Bills ───────────────────────────────────────────────────────────

function ExternalBillsCard({ bills }: { bills: ExternalBill[] }) {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [creditor, setCreditor] = useState("");
	const [description, setDescription] = useState("");
	const [amount, setAmount] = useState("");
	const [isPending, startTransition] = useTransition();

	function handleAdd() {
		const parsed = Number.parseFloat(amount.replace(",", "."));
		if (Number.isNaN(parsed) || !creditor.trim() || !description.trim()) return;

		startTransition(async () => {
			const res = await addExternalBill({ creditor: creditor.trim(), description: description.trim(), amount: parsed });
			if (res.success) {
				toast.success("Verbindlichkeit hinzugefügt");
				setOpen(false);
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

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between">
				<CardTitle className="text-base">Externe Verbindlichkeiten</CardTitle>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button size="sm" variant="outline">
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
			</CardHeader>
			<CardContent className="p-0">
				{bills.length === 0 ? (
					<p className="text-muted-foreground p-4 text-sm">Keine Verbindlichkeiten.</p>
				) : (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Gläubiger</TableHead>
								<TableHead>Beschreibung</TableHead>
								<TableHead className="text-right">Betrag</TableHead>
								<TableHead>Status</TableHead>
								<TableHead />
							</TableRow>
						</TableHeader>
						<TableBody>
							{[...openBills, ...paidBills].map((b) => (
								<TableRow key={b.id} className={b.status === "Bezahlt" ? "opacity-50" : ""}>
									<TableCell className="text-sm font-medium">{b.creditor}</TableCell>
									<TableCell className="text-sm">{b.description}</TableCell>
									<TableCell className="text-right text-sm font-semibold">{fmt(b.amount)}</TableCell>
									<TableCell>
										<Badge variant={b.status === "Bezahlt" ? "secondary" : "destructive"}>
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
			</CardContent>
		</Card>
	);
}

// ─── KasseTab ─────────────────────────────────────────────────────────────────

export default function KasseTab({ summary, bankEntries, externalBills, entityBills, memberBills, pfandWert }: Props) {
	return (
		<div className="flex flex-col gap-6">
			<SummaryCards summary={summary} />

			<div className="grid gap-6 lg:grid-cols-2">
				<BankLog entries={bankEntries} />
				<PfandCard initial={pfandWert} />
			</div>

			<MemberBillsCard bills={memberBills} />
			<EntityBillsCard bills={entityBills} />
			<ExternalBillsCard bills={externalBills} />
		</div>
	);
}
