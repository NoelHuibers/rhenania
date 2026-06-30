"use client";

import { CheckCircle, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Fragment, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
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
	type FuchsenUserBill,
	getFuchsenBillsByUser,
	getFuchsenOrdersForUser,
	markAllUserFuchsenOrdersPaid,
	updateFuchsenOrderStatus,
} from "~/server/actions/fuchsenladen/orders";

const currencyFormatter = new Intl.NumberFormat("de-DE", {
	style: "currency",
	currency: "EUR",
});
const dateFormatter = new Intl.DateTimeFormat("de-DE");

export function FuchsenBillsManagement() {
	const [bills, setBills] = useState<FuchsenUserBill[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
	const [userOrders, setUserOrders] = useState<Map<string, FuchsenOrder[]>>(
		new Map(),
	);
	const [, startTransition] = useTransition();

	const load = async () => {
		try {
			setIsLoading(true);
			const data = await getFuchsenBillsByUser();
			setBills(data);
		} catch (error) {
			console.error("Error loading fuchsen bills:", error);
			toast.error("Fehler beim Laden der Rechnungen");
		} finally {
			setIsLoading(false);
		}
	};

	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only, adding load causes infinite loop
	useEffect(() => {
		load();
	}, []);

	const toggleExpand = async (userId: string) => {
		if (expandedUserId === userId) {
			setExpandedUserId(null);
			return;
		}
		setExpandedUserId(userId);
		if (!userOrders.has(userId)) {
			const orders = await getFuchsenOrdersForUser(userId);
			setUserOrders((prev) => new Map(prev).set(userId, orders));
		}
	};

	const handleMarkAllPaid = (userId: string) => {
		startTransition(async () => {
			const result = await markAllUserFuchsenOrdersPaid(userId);
			if (result.success) {
				toast.success(
					`${result.count ?? 0} Bestellung(en) als bezahlt markiert`,
				);
				await load();
				if (expandedUserId === userId) {
					const orders = await getFuchsenOrdersForUser(userId);
					setUserOrders((prev) => new Map(prev).set(userId, orders));
				}
			} else {
				toast.error(result.error || "Fehler");
			}
		});
	};

	const handleToggleStatus = (
		orderId: string,
		userId: string,
		current: "Offen" | "Bezahlt",
	) => {
		const next = current === "Offen" ? "Bezahlt" : "Offen";
		startTransition(async () => {
			const result = await updateFuchsenOrderStatus(orderId, next);
			if (result.success) {
				toast.success(
					`Bestellung als ${next === "Bezahlt" ? "bezahlt" : "offen"} markiert`,
				);
				await load();
				const orders = await getFuchsenOrdersForUser(userId);
				setUserOrders((prev) => new Map(prev).set(userId, orders));
			} else {
				toast.error(result.error || "Fehler");
			}
		});
	};

	if (isLoading) {
		return (
			<div className="flex items-center justify-center py-8">
				<Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
			</div>
		);
	}

	if (bills.length === 0) {
		return (
			<div className="flex items-center justify-center py-12">
				<p className="text-muted-foreground">
					Noch keine Bestellungen vorhanden
				</p>
			</div>
		);
	}

	return (
		<div className="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead className="w-10" />
						<TableHead>Name</TableHead>
						<TableHead className="text-right">Offen</TableHead>
						<TableHead className="text-right">Bezahlt</TableHead>
						<TableHead className="text-right">Gesamt Bestellungen</TableHead>
						<TableHead className="w-40 text-right">Aktion</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{bills.map((bill) => {
						const isExpanded = expandedUserId === bill.userId;
						const orders = userOrders.get(bill.userId) ?? [];
						return (
							<Fragment key={bill.userId}>
								<TableRow
									className="cursor-pointer"
									onClick={() => toggleExpand(bill.userId)}
								>
									<TableCell>
										{isExpanded ? (
											<ChevronDown className="h-4 w-4" />
										) : (
											<ChevronRight className="h-4 w-4" />
										)}
									</TableCell>
									<TableCell className="font-medium">{bill.userName}</TableCell>
									<TableCell className="text-right">
										{bill.openTotal > 0 ? (
											<Badge variant="destructive">
												{currencyFormatter.format(bill.openTotal)}
											</Badge>
										) : (
											<span className="text-muted-foreground">
												{currencyFormatter.format(0)}
											</span>
										)}
									</TableCell>
									<TableCell className="text-right text-muted-foreground">
										{currencyFormatter.format(bill.paidTotal)}
									</TableCell>
									<TableCell className="text-right">
										{bill.totalCount}
									</TableCell>
									<TableCell className="text-right">
										{bill.openCount > 0 && (
											<Button
												size="sm"
												variant="outline"
												onClick={(e) => {
													e.stopPropagation();
													handleMarkAllPaid(bill.userId);
												}}
											>
												<CheckCircle className="mr-2 h-4 w-4" />
												Alle bezahlt
											</Button>
										)}
									</TableCell>
								</TableRow>
								{isExpanded && (
									<TableRow>
										<TableCell colSpan={6} className="bg-muted/30 p-0">
											<div className="p-4">
												{orders.length === 0 ? (
													<p className="text-muted-foreground text-sm">Lade…</p>
												) : (
													<Table>
														<TableHeader>
															<TableRow>
																<TableHead>Datum</TableHead>
																<TableHead>Artikel</TableHead>
																<TableHead className="text-right">
																	Anzahl
																</TableHead>
																<TableHead className="text-right">
																	Gesamt
																</TableHead>
																<TableHead>Status</TableHead>
																<TableHead className="w-32 text-right" />
															</TableRow>
														</TableHeader>
														<TableBody>
															{orders.map((order) => (
																<TableRow key={order.id}>
																	<TableCell>
																		{dateFormatter.format(
																			new Date(order.createdAt),
																		)}
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
																	<TableCell>
																		<Badge
																			variant={
																				order.status === "Bezahlt"
																					? "secondary"
																					: "destructive"
																			}
																		>
																			{order.status}
																		</Badge>
																	</TableCell>
																	<TableCell className="text-right">
																		<Button
																			size="sm"
																			variant="outline"
																			onClick={() =>
																				handleToggleStatus(
																					order.id,
																					bill.userId,
																					order.status,
																				)
																			}
																		>
																			{order.status === "Offen"
																				? "Als bezahlt"
																				: "Als offen"}
																		</Button>
																	</TableCell>
																</TableRow>
															))}
														</TableBody>
													</Table>
												)}
											</div>
										</TableCell>
									</TableRow>
								)}
							</Fragment>
						);
					})}
				</TableBody>
			</Table>
		</div>
	);
}
