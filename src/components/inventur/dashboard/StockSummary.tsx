import { formatEUR } from "~/lib/format";
import type { DashboardTotals } from "./dashboard-totals";

/** "Aktueller Bestand" with the sold, purchased, value, profit and loss figures. */
export function StockSummary({
	totals,
	profit,
}: {
	totals: DashboardTotals;
	/** Markup profit since the last inventory; null without the markup feature. */
	profit: number | null;
}) {
	const {
		totalSoldUnits,
		totalPurchasedUnits,
		totalInventoryValue,
		totalLostValue,
	} = totals;
	return (
		<div>
			<h2 className="font-semibold text-lg">Aktueller Bestand</h2>
			<div className="mt-2 flex flex-wrap gap-2">
				<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
					<span className="text-muted-foreground">Verkauft</span>
					<span className="font-semibold text-destructive">
						{totalSoldUnits} Fl.
					</span>
				</span>
				{totalPurchasedUnits > 0 && (
					<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
						<span className="text-muted-foreground">Eingekauft</span>
						<span className="font-semibold text-success">
							{totalPurchasedUnits} Fl.
						</span>
					</span>
				)}
				<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
					<span className="text-muted-foreground">Bestandswert</span>
					<span className="font-semibold text-primary">
						{formatEUR(totalInventoryValue)}
					</span>
				</span>
				{profit !== null && (
					<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
						<span className="text-muted-foreground">Gewinn</span>
						<span className="font-semibold text-success">
							{formatEUR(profit)}
						</span>
					</span>
				)}
				{totalLostValue > 0 && (
					<span className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm">
						<span className="text-muted-foreground">Verluste</span>
						<span className="font-semibold text-destructive">
							{formatEUR(totalLostValue)}
						</span>
					</span>
				)}
			</div>
		</div>
	);
}
