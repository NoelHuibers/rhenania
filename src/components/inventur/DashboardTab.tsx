// DashboardTab.tsx
"use client";

import type {
	ActiveEventInventory,
	EtaplanWithKostenpunkte,
	InventurEvent,
} from "~/server/actions/inventur/inventur";
import { InventoryCountDialog } from "./CountMode";
import { ActiveEventBanner } from "./dashboard/ActiveEventBanner";
import { DashboardActions } from "./dashboard/DashboardActions";
import { StockSummary } from "./dashboard/StockSummary";
import { useInventurDashboard } from "./dashboard/use-inventur-dashboard";
import { EventInventoryDialogs } from "./EventInventoryDialogs";
import { StockTable } from "./StockTable";
import type { StockStatusWithDetails } from "./utils";

interface DashboardTabProps {
	stockItems: StockStatusWithDetails[];
	activeEvent: ActiveEventInventory;
	events: InventurEvent[];
	etaplans: EtaplanWithKostenpunkte[];
	/** Markup profit since the last inventory; null without the markup feature. */
	profit?: number | null;
}

export function DashboardTab({
	stockItems,
	activeEvent,
	events,
	etaplans,
	profit = null,
}: DashboardTabProps) {
	const d = useInventurDashboard(stockItems);

	return (
		<>
			{activeEvent && (
				<ActiveEventBanner
					activeEvent={activeEvent}
					isPending={d.isEventPending}
					onFinish={() => d.setShowFinishEvent(true)}
					onCancel={d.handleCancelEvent}
				/>
			)}

			{/* Header */}
			<div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
				<StockSummary totals={d.totals} profit={profit} />
				<DashboardActions
					changedCount={d.changedItems.size}
					isQuickSaving={d.isQuickSaving}
					onQuickSave={d.handleQuickSave}
					showStartButtons={!activeEvent}
					isSaving={d.isSaving}
					isEventPending={d.isEventPending}
					onStartEvent={() => d.setShowStartEvent(true)}
					onFullInventory={d.openInventoryDialog}
				/>
			</div>

			{/* Stock: table from md up, one card per drink below */}
			<StockTable
				stockItems={stockItems}
				purchases={d.purchases}
				countedStock={d.countedStock}
				changedItems={d.changedItems}
				disabled={d.isSaving || d.isQuickSaving}
				onPurchaseInput={d.handlePurchaseInput}
				onCountedStockInput={d.handleCountedStockInput}
			/>

			<InventoryCountDialog
				open={d.showInventoryDialog}
				onOpenChange={d.setShowInventoryDialog}
				totalSoldUnits={d.totals.totalSoldUnits}
				uncounted={d.uncountedDrinks}
				total={stockItems.length}
				acceptUncounted={d.acceptUncounted}
				onAcceptUncountedChange={d.setAcceptUncounted}
				createInvoice={d.createInvoice}
				onCreateInvoiceChange={d.setCreateInvoice}
				isSaving={d.isSaving}
				blocked={d.blockedByUncounted}
				onCreate={d.handleCreateInventory}
			/>

			<EventInventoryDialogs
				events={events}
				etaplans={etaplans}
				stockItems={stockItems}
				purchases={d.purchases}
				countedStock={d.countedStock}
				buildItems={d.buildItems}
				onCounted={d.resetCounted}
				startOpen={d.showStartEvent}
				onStartOpenChange={d.setShowStartEvent}
				finishOpen={d.showFinishEvent}
				onFinishOpenChange={d.setShowFinishEvent}
				isPending={d.isEventPending}
				startTransition={d.startEventTransition}
			/>
		</>
	);
}
