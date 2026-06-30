"use client";

import { CheckCircle, Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Badge } from "~/components/ui/badge";
import {
	type FuchsenItem,
	getFuchsenItemsForMenu,
} from "~/server/actions/fuchsenladen/items";
import { FuchsenItemCard } from "./FuchsenItemCard";
import { FuchsenOrderDrawer } from "./FuchsenOrderDrawer";

export default function FuchsenladenMenu() {
	const [items, setItems] = useState<FuchsenItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [selectedItem, setSelectedItem] = useState<FuchsenItem | null>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);

	useEffect(() => {
		const load = async () => {
			try {
				setIsLoading(true);
				const fetched = await getFuchsenItemsForMenu();
				setItems(fetched);
			} catch (error) {
				console.error("Error loading fuchsen items:", error);
				toast.error("Fehler beim Laden des Fuchsenladens");
			} finally {
				setIsLoading(false);
			}
		};
		load();
	}, []);

	const handleOrderClick = (item: FuchsenItem) => {
		setSelectedItem(item);
		setIsDrawerOpen(true);
	};

	const handleDrawerClose = () => {
		setIsDrawerOpen(false);
		setSelectedItem(null);
	};

	const available = items.filter((i) => i.isCurrentlyAvailable);
	const unavailable = items.filter((i) => !i.isCurrentlyAvailable);

	return (
		<>
			<SiteHeader title="Fuchsenladen" />
			<div className="container mx-auto space-y-6 p-4">
				{isLoading ? (
					<div className="flex items-center justify-center py-16">
						<div className="text-muted-foreground">Laden…</div>
					</div>
				) : items.length === 0 ? (
					<div className="flex items-center justify-center py-16">
						<div className="text-center">
							<p className="text-muted-foreground">
								Aktuell sind keine Artikel im Fuchsenladen.
							</p>
						</div>
					</div>
				) : (
					<div className="space-y-8">
						{available.length > 0 && (
							<Section
								title="Verfügbare Artikel"
								items={available}
								icon="available"
								onOrderClick={handleOrderClick}
							/>
						)}

						{unavailable.length > 0 && (
							<Section
								title="Derzeit nicht verfügbar"
								items={unavailable}
								icon="unavailable"
								onOrderClick={handleOrderClick}
							/>
						)}
					</div>
				)}
			</div>

			<FuchsenOrderDrawer
				item={selectedItem}
				isOpen={isDrawerOpen}
				onClose={handleDrawerClose}
			/>
		</>
	);
}

function Section({
	title,
	items,
	icon,
	onOrderClick,
}: {
	title: string;
	items: FuchsenItem[];
	icon: "available" | "unavailable";
	onOrderClick: (item: FuchsenItem) => void;
}) {
	const IconComponent = icon === "available" ? CheckCircle : Clock;
	const iconColor = icon === "available" ? "text-green-500" : "text-orange-500";

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-3">
				<IconComponent className={`h-6 w-6 ${iconColor}`} />
				<h2 className="font-bold text-lg">{title}</h2>
				<Badge variant="secondary">{items.length}</Badge>
			</div>

			<div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
				{items.map((item) => (
					<FuchsenItemCard
						key={item.id}
						item={item}
						onOrderClick={onOrderClick}
					/>
				))}
			</div>
		</div>
	);
}
