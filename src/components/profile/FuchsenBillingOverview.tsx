"use client";

import { Loader2, ReceiptEuro } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Separator } from "~/components/ui/separator";
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

const currencyFormatter = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
});
const dateFormatter = new Intl.DateTimeFormat("de-DE");

export function FuchsenBillingOverview() {
	const [orders, setOrders] = useState<FuchsenOrder[]>([]);
	const [summary, setSummary] = useState({
		openTotal: 0,
		paidTotal: 0,
		openCount: 0,
	});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const load = async () => {
			try {
				setLoading(true);
				const [ordersData, summaryData] = await Promise.all([
					getMyFuchsenOrders(),
					getMyFuchsenSummary(),
				]);
				setOrders(ordersData);
				setSummary(summaryData);
			} catch (err) {
				setError(
					err instanceof Error
						? err.message
						: "Fehler beim Laden der Fuchsen-Rechnungen",
				);
			} finally {
				setLoading(false);
			}
		};
		load();
	}, []);

	if (loading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">
						Fuchsenladen-Rechnungen
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-8">
					<Loader2 className="h-4 w-4 animate-spin md:h-5 md:w-5" />
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">
						Fuchsenladen-Rechnungen
					</CardTitle>
				</CardHeader>
				<CardContent>
					<p className="text-destructive text-sm">{error}</p>
				</CardContent>
			</Card>
		);
	}

	if (orders.length === 0) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-lg md:text-xl">
						Fuchsenladen-Rechnungen
					</CardTitle>
				</CardHeader>
				<CardContent className="flex items-center justify-center py-8">
					<p className="text-muted-foreground text-sm">
						Du hast noch nichts im Fuchsenladen bestellt.
					</p>
				</CardContent>
			</Card>
		);
	}

	const openOrders = orders.filter((o) => o.status === "Offen");
	const paidOrders = orders.filter((o) => o.status === "Bezahlt");

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center justify-between text-lg md:text-xl">
					Fuchsenladen-Rechnungen
					{summary.openCount > 0 ? (
						<Badge variant="destructive" className="text-[10px] md:text-xs">
							{summary.openCount} offen
						</Badge>
					) : (
						<Badge variant="secondary" className="text-[10px] md:text-xs">
							Alles bezahlt
						</Badge>
					)}
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<div className="grid grid-cols-2 gap-4">
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">
							Offener Betrag
						</p>
						<p className="font-bold text-xl md:text-2xl">
							{currencyFormatter.format(summary.openTotal)}
						</p>
					</div>
					<div>
						<p className="text-muted-foreground text-xs md:text-sm">
							Bereits bezahlt
						</p>
						<p className="font-semibold text-base text-muted-foreground md:text-lg">
							{currencyFormatter.format(summary.paidTotal)}
						</p>
					</div>
				</div>

				<Separator />

				{openOrders.length > 0 && (
					<div className="space-y-2">
						<p className="font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Offene Bestellungen
						</p>
						<div className="overflow-x-auto rounded-md border">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Datum</TableHead>
										<TableHead>Artikel</TableHead>
										<TableHead className="text-right">Anzahl</TableHead>
										<TableHead className="text-right">Gesamt</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{openOrders.map((order) => (
										<TableRow key={order.id}>
											<TableCell>
												{dateFormatter.format(new Date(order.createdAt))}
											</TableCell>
											<TableCell className="font-medium">
												{order.itemName}
											</TableCell>
											<TableCell className="text-right">
												{order.amount}
											</TableCell>
											<TableCell className="text-right">
												{currencyFormatter.format(order.total)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</div>
				)}

				{paidOrders.length > 0 && (
					<details className="rounded-md border">
						<summary className="cursor-pointer p-3 font-medium text-muted-foreground text-xs uppercase tracking-wider">
							Bezahlte Bestellungen ({paidOrders.length})
						</summary>
						<div className="overflow-x-auto border-t">
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Datum</TableHead>
										<TableHead>Artikel</TableHead>
										<TableHead className="text-right">Anzahl</TableHead>
										<TableHead className="text-right">Gesamt</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{paidOrders.map((order) => (
										<TableRow key={order.id}>
											<TableCell>
												{dateFormatter.format(new Date(order.createdAt))}
											</TableCell>
											<TableCell className="font-medium">
												{order.itemName}
											</TableCell>
											<TableCell className="text-right">
												{order.amount}
											</TableCell>
											<TableCell className="text-right">
												{currencyFormatter.format(order.total)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</div>
					</details>
				)}

				<Button asChild variant="outline" className="w-full gap-2">
					<Link href="/fuchsenrechnungen">
						<ReceiptEuro className="h-4 w-4" />
						Rechnungen, PDF &amp; PayPal
					</Link>
				</Button>
			</CardContent>
		</Card>
	);
}
