import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import {
	cancelEventInventory,
	saveQuickAdjustments,
} from "~/server/actions/inventur/inventur";
import { submitInventory } from "../CountMode";
import { removeSavedItemIds } from "../changed-items";
import {
	buildInventoryCount,
	buildQuickAdjustments,
	findUncountedDrinks,
	isBlockedByUncounted,
} from "../inventory-count";
import type { StockStatusWithDetails } from "../utils";
import { dashboardTotals } from "./dashboard-totals";

function withId(ids: Set<string>, id: string): Set<string> {
	return ids.has(id) ? ids : new Set(ids).add(id);
}

/**
 * State and interaction for the Inventur dashboard: the purchases and "Ist"
 * values typed into the stock table, which drinks changed or were counted,
 * the quick save, the full inventory and the event inventory dialogs.
 */
export function useInventurDashboard(stockItems: StockStatusWithDetails[]) {
	const router = useRouter();

	const [purchases, setPurchases] = useState<{ [key: string]: number }>(() => {
		const initial: { [key: string]: number } = {};
		for (const item of stockItems) {
			if (item.purchasedSince > 0) {
				initial[item.drinkId] = item.purchasedSince;
			}
		}
		return initial;
	});
	const [countedStock, setCountedStock] = useState<{ [key: string]: number }>(
		{},
	);
	const [changedItems, setChangedItems] = useState<Set<string>>(new Set());
	// Drinks whose "Ist" was entered; the others only show a pre-filled value.
	const [countedIds, setCountedIds] = useState<Set<string>>(new Set());
	const [acceptUncounted, setAcceptUncounted] = useState(false);
	const [isSaving, startSaving] = useTransition();
	const [isQuickSaving, startQuickSaving] = useTransition();
	const [showInventoryDialog, setShowInventoryDialog] = useState(false);
	const [createInvoice, setCreateInvoice] = useState(false);
	const [showStartEvent, setShowStartEvent] = useState(false);
	const [showFinishEvent, setShowFinishEvent] = useState(false);
	const [isEventPending, startEventTransition] = useTransition();

	useEffect(() => {
		const initialStock: { [key: string]: number } = {};
		const initialPurchases: { [key: string]: number } = {};
		for (const item of stockItems) {
			initialStock[item.drinkId] = item.countedStock ?? item.calculatedStock;
			if (item.purchasedSince > 0) {
				initialPurchases[item.drinkId] = item.purchasedSince;
			}
		}
		setCountedStock(initialStock);
		setPurchases(initialPurchases);
	}, [stockItems]);

	const handlePurchaseInput = (drinkId: string, value: number) => {
		setPurchases((prev) => ({ ...prev, [drinkId]: value }));
		const item = stockItems.find((i) => i.drinkId === drinkId);
		if (!item) {
			return;
		}
		const originalPurchase = item.purchasedSince || 0;
		if (value !== originalPurchase) {
			setChangedItems((prev) => new Set(prev).add(drinkId));
		} else if (countedStock[drinkId] === item.calculatedStock) {
			setChangedItems((prev) => {
				const next = new Set(prev);
				next.delete(drinkId);
				return next;
			});
		}
		if (
			countedStock[drinkId] ===
			item.calculatedStock + (purchases[drinkId] || 0)
		) {
			setCountedStock((prev) => ({
				...prev,
				[drinkId]: item.calculatedStock + value,
			}));
		}
	};

	const handleCountedStockInput = (drinkId: string, value: number) => {
		setCountedStock((prev) => ({ ...prev, [drinkId]: value }));
		setCountedIds((prev) => withId(prev, drinkId));
		const item = stockItems.find((i) => i.drinkId === drinkId);
		if (!item) {
			return;
		}
		const expected = item.calculatedStock + (purchases[drinkId] || 0);
		if (value !== expected) {
			setChangedItems((prev) => new Set(prev).add(drinkId));
		} else if (!purchases[drinkId]) {
			setChangedItems((prev) => {
				const next = new Set(prev);
				next.delete(drinkId);
				return next;
			});
		}
	};

	const handleQuickSave = () => {
		const savedItemIds = Array.from(changedItems);
		startQuickSaving(async () => {
			try {
				const adjustments = buildQuickAdjustments(savedItemIds, stockItems, {
					countedStock,
					purchases,
					countedIds,
				});

				if (adjustments.length === 0) {
					toast.info("Keine Änderungen zum Speichern");
					return;
				}
				const result = await saveQuickAdjustments(adjustments);
				if (!result.ok) {
					toast.error(result.error);
					return;
				}
				setChangedItems((currentItems) =>
					removeSavedItemIds(currentItems, savedItemIds),
				);
				toast.success(`${adjustments.length} Artikel aktualisiert`);
				router.refresh();
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Änderungen konnten nicht gespeichert werden",
				);
			}
		});
	};

	const buildItems = () =>
		buildInventoryCount(stockItems, { countedStock, purchases });

	const uncountedDrinks = findUncountedDrinks(stockItems, countedIds);
	const blockedByUncounted = isBlockedByUncounted(
		uncountedDrinks,
		acceptUncounted,
	);

	const finishInventory = () => {
		setCountedIds(new Set());
		setAcceptUncounted(false);
		setShowInventoryDialog(false);
		setCreateInvoice(false);
		router.refresh();
	};

	const handleCreateInventory = (withInvoice = false) => {
		startSaving(async () => {
			try {
				if (await submitInventory(buildItems(), withInvoice)) {
					finishInventory();
				}
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Inventur konnte nicht erstellt werden",
				);
			}
		});
	};

	const handleCancelEvent = () => {
		startEventTransition(async () => {
			const res = await cancelEventInventory();
			if (res.ok) {
				toast.success("Veranstaltungs-Inventur abgebrochen");
				router.refresh();
			} else {
				toast.error(res.error);
			}
		});
	};

	const openInventoryDialog = () => {
		setAcceptUncounted(false);
		setShowInventoryDialog(true);
	};

	return {
		purchases,
		countedStock,
		changedItems,
		acceptUncounted,
		setAcceptUncounted,
		isSaving,
		isQuickSaving,
		showInventoryDialog,
		setShowInventoryDialog,
		openInventoryDialog,
		createInvoice,
		setCreateInvoice,
		showStartEvent,
		setShowStartEvent,
		showFinishEvent,
		setShowFinishEvent,
		isEventPending,
		startEventTransition,
		handlePurchaseInput,
		handleCountedStockInput,
		handleQuickSave,
		handleCreateInventory,
		handleCancelEvent,
		buildItems,
		resetCounted: () => setCountedIds(new Set()),
		uncountedDrinks,
		blockedByUncounted,
		totals: dashboardTotals(stockItems, purchases, countedStock),
	};
}
