"use client";

import { ShoppingCart, UserCheck } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "~/components/ui/select";
import { getAllUsers, type User } from "~/server/actions/game/getUsers";
import { getAllDrinksForMenu } from "~/server/actions/menu";
import { createOrder } from "~/server/actions/orders";
import {
	BillingSelector,
	type BillingOption,
} from "~/components/trinken/drinks/Billingselector";
import { NumericInput } from "~/components/NumericInput";

type Drink = {
	id: string;
	name: string;
	price: number;
	isCurrentlyAvailable: boolean;
};

export default function BookingTab() {
	const [users, setUsers] = useState<User[]>([]);
	const [drinks, setDrinks] = useState<Drink[]>([]);
	const [loading, setLoading] = useState(true);

	const [selectedUserId, setSelectedUserId] = useState<string>("");
	const [selectedDrinkId, setSelectedDrinkId] = useState<string>("");
	const [quantity, setQuantity] = useState(1);
	const [billing, setBilling] = useState<BillingOption>(null);

	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		const load = async () => {
			try {
				const [usersData, drinksData] = await Promise.all([
					getAllUsers(),
					getAllDrinksForMenu(),
				]);
				setUsers(usersData);
				setDrinks(drinksData);
			} catch {
				toast.error("Fehler beim Laden der Daten");
			} finally {
				setLoading(false);
			}
		};
		load();
	}, []);

	const selectedUser = users.find((u) => u.id === selectedUserId);
	const selectedDrink = drinks.find((d) => d.id === selectedDrinkId);
	const total = selectedDrink ? selectedDrink.price * quantity : 0;

	const handleSubmit = () => {
		if (!selectedUserId || !selectedDrink) return;

		startTransition(async () => {
			const result = await createOrder({
				drinkId: selectedDrink.id,
				drinkName: selectedDrink.name,
				amount: quantity,
				pricePerUnit: selectedDrink.price,
				total,
				bookingFor: billing,
				targetUserId: selectedUserId,
				targetUserName:
					selectedUser?.name ?? selectedUser?.email ?? undefined,
			});

			if (result.success) {
				toast.success(
					`${quantity}x ${selectedDrink.name} für ${selectedUser?.name ?? selectedUser?.email} gebucht`,
				);
				// Reset form
				setSelectedUserId("");
				setSelectedDrinkId("");
				setQuantity(1);
				setBilling(null);
			} else {
				toast.error(result.error ?? "Fehler beim Buchen");
			}
		});
	};

	if (loading) {
		return (
			<div className="py-12 text-center text-muted-foreground">Laden...</div>
		);
	}

	return (
		<div className="max-w-lg space-y-6">
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<UserCheck className="h-5 w-5" />
						Bestellung für Mitglied buchen
					</CardTitle>
				</CardHeader>
				<CardContent className="space-y-5">
					{/* User selector */}
					<div className="space-y-1.5">
						<Label>Mitglied</Label>
						<Select
							value={selectedUserId}
							onValueChange={setSelectedUserId}
							disabled={isPending}
						>
							<SelectTrigger>
								<SelectValue placeholder="Mitglied auswählen..." />
							</SelectTrigger>
							<SelectContent>
								{users.map((user) => (
									<SelectItem key={user.id} value={user.id}>
										{user.name ?? user.email}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Drink selector */}
					<div className="space-y-1.5">
						<Label>Getränk</Label>
						<Select
							value={selectedDrinkId}
							onValueChange={setSelectedDrinkId}
							disabled={isPending}
						>
							<SelectTrigger>
								<SelectValue placeholder="Getränk auswählen..." />
							</SelectTrigger>
							<SelectContent>
								{drinks.map((drink) => (
									<SelectItem key={drink.id} value={drink.id}>
										<span
											className={
												drink.isCurrentlyAvailable
													? ""
													: "text-muted-foreground"
											}
										>
											{drink.name} — €{drink.price.toFixed(2)}
											{!drink.isCurrentlyAvailable && " (nicht verfügbar)"}
										</span>
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{/* Quantity */}
					<div className="space-y-1.5">
						<Label>Menge</Label>
						<NumericInput
							value={quantity}
							onChange={(v) => {
								if (!Number.isNaN(v) && v >= 1) setQuantity(v);
							}}
							min={1}
							max={200}
							disabled={isPending}
							className="w-28"
						/>
					</div>

					{/* Billing option */}
					<div className="space-y-1.5">
						<Label>Abrechnung</Label>
						<BillingSelector
							selectedBilling={billing}
							onBillingChange={setBilling}
						/>
					</div>

					{/* Summary */}
					{selectedUser && selectedDrink && (
						<div className="rounded-lg border bg-muted/40 p-3 text-sm">
							<div className="flex justify-between">
								<span className="text-muted-foreground">Mitglied</span>
								<span className="font-medium">
									{selectedUser.name ?? selectedUser.email}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Getränk</span>
								<span>
									{quantity}x {selectedDrink.name}
								</span>
							</div>
							<div className="flex justify-between">
								<span className="text-muted-foreground">Abrechnung</span>
								{billing ? (
									<Badge variant="secondary">{billing}</Badge>
								) : (
									<span>Eigene Kosten</span>
								)}
							</div>
							<div className="mt-2 flex justify-between border-t pt-2 font-semibold">
								<span>Gesamt</span>
								<span>€{total.toFixed(2)}</span>
							</div>
						</div>
					)}

					<Button
						onClick={handleSubmit}
						disabled={!selectedUserId || !selectedDrinkId || isPending}
						className="w-full"
					>
						<ShoppingCart className="mr-2 h-4 w-4" />
						{isPending ? "Wird gebucht..." : "Bestellung buchen"}
					</Button>
				</CardContent>
			</Card>
		</div>
	);
}
