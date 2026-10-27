"use client";

import { Coffee } from "lucide-react";
import { useEffect, useState } from "react";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { CardGridSkeleton } from "~/components/ui/page-skeleton";
import { unitPriceFor } from "~/lib/pricing";
import {
	getAllDrinksForMenu,
	getDrinkMarkupPercent,
	type MenuItem,
} from "~/server/actions/menu";

import { SiteHeader } from "../SiteHeader";
import { type BillingOption, BillingSelector } from "./Billingselector";
import { DrinksSection } from "./DrinksSection";
import { MenuFooter } from "./MenuFooter";
import { OrderDrawer } from "./OrderDrawer";

export function DrinksMenu() {
	const [drinks, setDrinks] = useState<MenuItem[]>([]);
	const [markupPercent, setMarkupPercent] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [loadFailed, setLoadFailed] = useState(false);
	const [selectedDrink, setSelectedDrink] = useState<MenuItem | null>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);
	const [selectedBilling, setSelectedBilling] = useState<BillingOption>(null);

	// Load drinks on component mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: mount-only effect, loadDrinks is intentionally excluded
	useEffect(() => {
		loadDrinks();
	}, []);

	const loadDrinks = async () => {
		try {
			setIsLoading(true);
			setLoadFailed(false);
			const [fetchedDrinks, markup] = await Promise.all([
				getAllDrinksForMenu(),
				getDrinkMarkupPercent(),
			]);
			setDrinks(fetchedDrinks);
			setMarkupPercent(markup);
		} catch (error) {
			console.error("Error loading drinks:", error);
			setLoadFailed(true);
		} finally {
			setIsLoading(false);
		}
	};

	const handleOrderClick = (drink: MenuItem) => {
		setSelectedDrink(drink);
		setIsDrawerOpen(true);
	};

	const handleDrawerClose = () => {
		setIsDrawerOpen(false);
		setSelectedDrink(null);
	};

	// Show what the member is actually charged: personal orders carry the
	// tenant's markup (if any), group bookings the plain price. The server
	// recomputes the price on order, this is display only.
	const pricedDrinks = drinks.map((drink) => ({
		...drink,
		price: unitPriceFor(drink.price, markupPercent, selectedBilling),
	}));

	// Group drinks by availability
	const availableDrinks = pricedDrinks.filter(
		(drink) => drink.isCurrentlyAvailable,
	);
	const unavailableDrinks = pricedDrinks.filter(
		(drink) => !drink.isCurrentlyAvailable,
	);

	if (isLoading) {
		return (
			<>
				<SiteHeader title="Getränkekarte" />
				<div className="container mx-auto p-4">
					<CardGridSkeleton label="Getränkekarte wird geladen…" />
				</div>
			</>
		);
	}

	if (loadFailed) {
		return (
			<>
				<SiteHeader title="Getränkekarte" />
				<ErrorState
					title="Getränkekarte nicht geladen"
					onRetry={() => void loadDrinks()}
				>
					Die Getränkekarte konnte nicht geladen werden. Prüfe deine Verbindung
					und versuche es noch einmal.
				</ErrorState>
			</>
		);
	}

	return (
		<>
			<SiteHeader title="Getränkekarte" />
			<div className="container mx-auto space-y-6 p-4">
				<BillingSelector
					selectedBilling={selectedBilling}
					onBillingChange={setSelectedBilling}
				/>

				{drinks.length === 0 ? (
					<EmptyState icon={<Coffee />} title="Keine Getränke verfügbar">
						Die Getränkekarte ist noch leer. Bitte wende dich an den
						Getränkewart oder Admin.
					</EmptyState>
				) : (
					<div className="space-y-8">
						{availableDrinks.length > 0 && (
							<DrinksSection
								title="Verfügbare Getränke"
								drinks={availableDrinks}
								icon="available"
								onOrderClick={handleOrderClick}
							/>
						)}

						{unavailableDrinks.length > 0 && (
							<DrinksSection
								title="Derzeit nicht verfügbar"
								drinks={unavailableDrinks}
								icon="unavailable"
								onOrderClick={handleOrderClick}
							/>
						)}
					</div>
				)}

				<MenuFooter />
			</div>

			<OrderDrawer
				drink={selectedDrink}
				isOpen={isDrawerOpen}
				onClose={handleDrawerClose}
				selectedBilling={selectedBilling}
			/>
		</>
	);
}
