import { useRef, useState } from "react";
import { toast } from "sonner";
import {
	getBillsForPeriod,
	updateBillStatus,
} from "~/server/actions/billings/billings";
import type { BillingEntry, BillPeriod } from "./billing-types";

/** What the server loads for /rechnungen before the page is sent (#24). */
export type BillingDashboardInitial = {
	currentOrders: BillingEntry[];
	/** Newest first. */
	periods: BillPeriod[];
	/** The viewer's roles in this Corps. */
	roles: string[];
};

/** One bill period's bills, loaded the first time it is shown. */
type PeriodBills = {
	entries: BillingEntry[];
	isLoading: boolean;
	error: string | null;
};

const NOT_LOADED: PeriodBills = { entries: [], isLoading: true, error: null };

/**
 * State and interaction for the BillingDashboard. The open orders and the
 * list of periods come from the server; a period's bills load when its tab
 * is opened or, for older periods, when it is expanded (#24).
 */
export function useBillingDashboard(initial: BillingDashboardInitial) {
	const { currentOrders, periods, roles } = initial;
	const [activeTab, setActiveTabState] = useState("current-orders");
	const [bills, setBills] = useState<Map<string, PeriodBills>>(new Map());
	const [expanded, setExpanded] = useState<Set<string>>(new Set());
	// Periods already requested, so a quick double click loads once.
	const requested = useRef(new Set<string>());

	const currentBillPeriod = periods[0] ?? null;
	const previousBillPeriod = periods[1] ?? null;
	const olderPeriods = periods.slice(2);

	const hasRequiredRole = () => roles.includes("Getränkewart");

	const loadPeriod = (periodId: string, errorMessage: string) => {
		if (requested.current.has(periodId)) {
			return;
		}
		requested.current.add(periodId);
		setBills((prev) => new Map(prev).set(periodId, NOT_LOADED));
		getBillsForPeriod(periodId)
			.then((entries) =>
				setBills((prev) =>
					new Map(prev).set(periodId, {
						entries,
						isLoading: false,
						error: null,
					}),
				),
			)
			.catch((err) => {
				console.error(`Error fetching bills for period ${periodId}:`, err);
				// Let the next open try again.
				requested.current.delete(periodId);
				setBills((prev) =>
					new Map(prev).set(periodId, {
						entries: [],
						isLoading: false,
						error: errorMessage,
					}),
				);
			});
	};

	const setActiveTab = (tab: string) => {
		setActiveTabState(tab);
		if (tab === "current-billing" && currentBillPeriod) {
			loadPeriod(
				currentBillPeriod.id,
				"Fehler beim Laden der aktuellen Abrechnungen",
			);
		} else if (tab === "previous-billing" && previousBillPeriod) {
			loadPeriod(
				previousBillPeriod.id,
				"Fehler beim Laden der letzten Abrechnungen",
			);
		}
	};

	const setPeriodExpanded = (periodId: string, open: boolean) => {
		setExpanded((prev) => {
			const next = new Set(prev);
			if (open) {
				next.add(periodId);
			} else {
				next.delete(periodId);
			}
			return next;
		});
		if (open) {
			loadPeriod(periodId, "Fehler beim Laden der Abrechnungen");
		}
	};

	/** A period's bills; empty and not loading when there is no such period. */
	const billsFor = (period: BillPeriod | null): PeriodBills =>
		period
			? (bills.get(period.id) ?? NOT_LOADED)
			: { entries: [], isLoading: false, error: null };

	const setEntryStatus = (
		entryId: string,
		patch: Pick<BillingEntry, "status"> & Partial<BillingEntry>,
	) =>
		setBills((prev) => {
			const next = new Map(prev);
			for (const [periodId, period] of prev) {
				if (period.entries.some((entry) => entry.id === entryId)) {
					next.set(periodId, {
						...period,
						entries: period.entries.map((entry) =>
							entry.id === entryId ? { ...entry, ...patch } : entry,
						),
					});
				}
			}
			return next;
		});

	const handleStatusChange = async (
		entryId: string,
		newStatus: BillingEntry["status"],
	) => {
		if (!hasRequiredRole()) {
			toast.error("Sie haben keine Berechtigung, den Status zu ändern");
			return;
		}
		if (!entryId || typeof entryId !== "string") {
			toast.error("Ungültige Eintrags-ID");
			return;
		}

		if (
			!newStatus ||
			!["Bezahlt", "Unbezahlt", "Gestundet"].includes(newStatus)
		) {
			toast.error("Ungültiger Status");
			return;
		}

		const originalStatus = [...bills.values()]
			.flatMap((period) => period.entries)
			.find((entry) => entry.id === entryId)?.status;

		try {
			setEntryStatus(entryId, { status: newStatus });

			const result = await updateBillStatus(entryId, newStatus);

			if (result.ok) {
				toast.success("Status erfolgreich aktualisiert");
				setEntryStatus(entryId, {
					status: newStatus,
					paidAt: newStatus === "Bezahlt" ? new Date() : null,
				});
			} else {
				setEntryStatus(entryId, { status: originalStatus });
				console.error(`Failed to update status for ${entryId}`);
				toast.error(result.error);
			}
		} catch (error) {
			// Revert the optimistic update on error
			setEntryStatus(entryId, { status: originalStatus });
			console.error("Error updating status:", error);
			toast.error("Fehler beim Aktualisieren des Status");
		}
	};

	return {
		activeTab,
		setActiveTab,
		currentOrders,
		currentBillPeriod,
		currentBilling: billsFor(currentBillPeriod),
		previousBillPeriod,
		previousBilling: billsFor(previousBillPeriod),
		allBillPeriods: periods,
		olderPeriods,
		isExpanded: (periodId: string) => expanded.has(periodId),
		setPeriodExpanded,
		olderBilling: (period: BillPeriod) => billsFor(period),
		hasRequiredRole,
		handleStatusChange,
	};
}
