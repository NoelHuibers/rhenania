"use client";

import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "~/components/ui/table";
import type { FuchsenOrder } from "~/server/actions/fuchsenladen/orders";
import {
	getMyFuchsenOrders,
	getMyFuchsenSummary,
} from "~/server/actions/fuchsenladen/orders";

const currency = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
});
const date = new Intl.DateTimeFormat("de-DE");

export default function FuchsenOrdersPage() {
	const [orders, setOrders] = useState<FuchsenOrder[]>([]);
	const [summary, setSummary] = useState({
		openTotal: 0,
		paidTotal: 0,
		openCount: 0,
	});
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		Promise.all([getMyFuchsenOrders(), getMyFuchsenSummary()])
			.then(([o, s]) => {
				setOrders(o);
				setSummary(s);
			})
			.catch(() => toast.error("Fehler beim Laden der Bestellungen"))
			.finally(() => setLoading(false));
	}, []);

	return (
		<>
			<SiteHeader title="Fuchsenbestellungen" />
			<div className="container mx-auto space-y-4 p-4">
				<div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
					<SummaryCard
						label="Offener Betrag"
						value={currency.format(summary.openTotal)}
						accent
					/>
					<SummaryCard
						label="Bereits bezahlt"
						value={currency.format(summary.paidTotal)}
					/>
					<SummaryCard
						label="Offene Bestellungen"
						value={String(summary.openCount)}
					/>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-lg">
							Meine Fuchsen-Bestellungen
						</CardTitle>
					</CardHeader>
					<CardContent>
						{loading ? (
							<div className="flex items-center justify-center py-8">
								<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
							</div>
						) : orders.length === 0 ? (
							<p className="py-8 text-center text-muted-foreground text-sm">
								Du hast noch nichts im Fuchsenladen bestellt.
							</p>
						) : (
							<div className="overflow-x-auto">
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Datum</TableHead>
											<TableHead>Artikel</TableHead>
											<TableHead className="text-right">Anzahl</TableHead>
											<TableHead className="text-right">Gesamt</TableHead>
											<TableHead>Status</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{orders.map((order) => (
											<TableRow key={order.id}>
												<TableCell>
													{date.format(new Date(order.createdAt))}
												</TableCell>
												<TableCell className="font-medium">
													{order.itemName}
												</TableCell>
												<TableCell className="text-right">
													{order.amount}
												</TableCell>
												<TableCell className="text-right">
													{currency.format(order.total)}
												</TableCell>
												<TableCell>
													{order.status === "Bezahlt" ? (
														<Badge variant="secondary">Bezahlt</Badge>
													) : order.billId ? (
														<Badge variant="outline">Abgerechnet</Badge>
													) : (
														<Badge variant="destructive">Offen</Badge>
													)}
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							</div>
						)}
					</CardContent>
				</Card>
			</div>
		</>
	);
}

function SummaryCard({
	label,
	value,
	accent,
}: {
	label: string;
	value: string;
	accent?: boolean;
}) {
	return (
		<Card>
			<CardContent className="p-4">
				<p className="text-muted-foreground text-xs sm:text-sm">{label}</p>
				<p
					className={`mt-1 font-bold text-xl sm:text-2xl ${
						accent ? "text-destructive" : ""
					}`}
				>
					{value}
				</p>
			</CardContent>
		</Card>
	);
}
