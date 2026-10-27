"use client";

import { CheckCircle, Clock, Store } from "lucide-react";
import { useEffect, useState } from "react";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Badge } from "~/components/ui/badge";
import { EmptyState } from "~/components/ui/empty-state";
import { ErrorState } from "~/components/ui/error-state";
import { CardGridSkeleton } from "~/components/ui/page-skeleton";
import {
	type FuchsenItem,
	getFuchsenItemsForMenu,
} from "~/server/actions/fuchsenladen/items";
import { FuchsenItemCard } from "./FuchsenItemCard";
import { FuchsenOrderDrawer } from "./FuchsenOrderDrawer";

export function FuchsenladenMenu() {
	const [items, setItems] = useState<FuchsenItem[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [loadFailed, setLoadFailed] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [selectedItem, setSelectedItem] = useState<FuchsenItem | null>(null);
	const [isDrawerOpen, setIsDrawerOpen] = useState(false);

	// biome-ignore lint/correctness/useExhaustiveDependencies: `attempt` re-runs the load on retry
	useEffect(() => {
		const load = async () => {
			try {
				setIsLoading(true);
				setLoadFailed(false);
				const fetched = await getFuchsenItemsForMenu();
				setItems(fetched);
			} catch (error) {
				console.error("Error loading fuchsen items:", error);
				setLoadFailed(true);
			} finally {
				setIsLoading(false);
			}
		};
		load();
	}, [attempt]);

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
					<CardGridSkeleton label="Fuchsenladen wird geladen…" />
				) : loadFailed ? (
					<ErrorState
						title="Fuchsenladen nicht geladen"
						onRetry={() => setAttempt((n) => n + 1)}
					>
						Die Artikel konnten nicht geladen werden. Versuche es noch einmal.
					</ErrorState>
				) : items.length === 0 ? (
					<EmptyState icon={<Store />} title="Keine Artikel im Fuchsenladen">
						Sobald der Fuchsenwart Artikel anlegt, kannst du sie hier bestellen.
					</EmptyState>
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
	const iconColor =
		icon === "available" ? "text-success" : "text-warning-muted-foreground";

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
