import { useEffect, useState } from "react";
import { toast } from "sonner";
import { getUserRoles } from "~/server/actions/admin/userRoles";
import {
	getAllBillPeriods,
	getBillsForPeriod,
	getLatestBillPeriod,
	updateBillStatus,
} from "~/server/actions/billings/billings";
import { getCurrentOrders } from "~/server/actions/currentOrders";
import { useSession } from "~/server/auth/client";
import type { BillingEntry, BillPeriod } from "./billing-types";

/** State, tab-driven loading and status updates for the BillingDashboard. */
export function useBillingDashboard() {
	const { data: session, isPending } = useSession();
	const [activeTab, setActiveTab] = useState("current-orders");

	const [userRoles, setUserRoles] = useState<string[]>([]);

	// State for current orders
	const [currentOrders, setCurrentOrders] = useState<BillingEntry[]>([]);
	const [isLoadingOrders, setIsLoadingOrders] = useState(true);
	const [ordersError, setOrdersError] = useState<string | null>(null);

	// State for current billing
	const [currentBilling, setCurrentBilling] = useState<BillingEntry[]>([]);
	const [isLoadingBilling, setIsLoadingBilling] = useState(false);
	const [billingError, setBillingError] = useState<string | null>(null);
	const [currentBillPeriod, setCurrentBillPeriod] = useState<BillPeriod | null>(
		null,
	);

	// State for previous billing
	const [previousBilling, setPreviousBilling] = useState<BillingEntry[]>([]);
	const [isLoadingPreviousBilling, setIsLoadingPreviousBilling] =
		useState(false);
	const [previousBillingError, setPreviousBillingError] = useState<
		string | null
	>(null);
	const [previousBillPeriod, setPreviousBillPeriod] =
		useState<BillPeriod | null>(null);

	// State for all bill periods
	const [allBillPeriods, setAllBillPeriods] = useState<BillPeriod[]>([]);
	const [billPeriodsData, setBillPeriodsData] = useState<
		Map<string, BillingEntry[]>
	>(new Map());

	const hasRequiredRole = () => {
		return userRoles.includes("Getränkewart");
	};

	const isAuthenticated = !isPending && !!session?.user?.id;

	useEffect(() => {
		const fetchUserRoles = async () => {
			if (!session?.user?.id) {
				setUserRoles([]);
				return;
			}

			try {
				const roles = await getUserRoles(session.user.id);

				if (!Array.isArray(roles)) {
					throw new Error("Invalid roles response");
				}

				setUserRoles(
					roles.map((role) => {
						if (typeof role?.name !== "string") {
							throw new Error("Invalid role structure");
						}
						return role.name;
					}),
				);
			} catch (err) {
				console.error("Error fetching user roles:", err);
				setUserRoles([]);
				toast.error("Fehler beim Laden der Benutzerrollen");
			}
		};

		fetchUserRoles();
	}, [session?.user?.id]);

	useEffect(() => {
		const fetchCurrentOrders = async () => {
			if (!isAuthenticated) {
				return;
			}

			try {
				setIsLoadingOrders(true);
				setOrdersError(null);
				const orders = await getCurrentOrders();
				setCurrentOrders(orders);
			} catch (err) {
				setOrdersError("Fehler beim Laden der aktuellen Bestellungen");
				console.error("Fehler beim Abrufen der aktuellen Bestellungen:", err);
			} finally {
				setIsLoadingOrders(false);
			}
		};

		fetchCurrentOrders();
	}, [isAuthenticated]);

	useEffect(() => {
		const fetchAllBillPeriods = async () => {
			if (!isAuthenticated) {
				return;
			}

			try {
				const periods = await getAllBillPeriods();
				const sortedPeriods = periods.sort(
					(a: BillPeriod, b: BillPeriod) =>
						new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
				);
				setAllBillPeriods(sortedPeriods);
			} catch (err) {
				console.error("Error fetching bill periods:", err);
			}
		};

		fetchAllBillPeriods();
	}, [isAuthenticated]);

	// biome-ignore lint/correctness/useExhaustiveDependencies: billPeriodsData intentionally excluded to avoid infinite loop
	useEffect(() => {
		if (!isAuthenticated) {
			return;
		}

		if (activeTab === "current-billing") {
			const fetchCurrentBilling = async () => {
				try {
					setIsLoadingBilling(true);
					setBillingError(null);

					const latestPeriod = await getLatestBillPeriod();
					if (latestPeriod) {
						setCurrentBillPeriod(latestPeriod);
						const bills = await getBillsForPeriod(latestPeriod.id);
						setCurrentBilling(bills);
					} else {
						setCurrentBilling([]);
						setCurrentBillPeriod(null);
					}
				} catch (err) {
					setBillingError("Fehler beim Laden der aktuellen Abrechnungen");
					console.error("Fehler beim Abrufen der aktuellen Abrechnungen:", err);
				} finally {
					setIsLoadingBilling(false);
				}
			};

			fetchCurrentBilling();
		} else if (activeTab === "previous-billing") {
			const fetchPreviousBilling = async () => {
				try {
					setIsLoadingPreviousBilling(true);
					setPreviousBillingError(null);

					// Get the second most recent period (previous billing)
					if (allBillPeriods.length > 1) {
						const previousPeriod = allBillPeriods[1];
						if (!previousPeriod) {
							return;
						}
						setPreviousBillPeriod(previousPeriod);
						const bills = await getBillsForPeriod(previousPeriod.id);
						setPreviousBilling(bills);
					} else {
						setPreviousBilling([]);
						setPreviousBillPeriod(null);
					}
				} catch (err) {
					setPreviousBillingError("Fehler beim Laden der letzten Abrechnungen");
					console.error("Fehler beim Abrufen der letzten Abrechnungen:", err);
				} finally {
					setIsLoadingPreviousBilling(false);
				}
			};

			fetchPreviousBilling();
		} else if (activeTab === "older-bills") {
			// Load data for older periods (skip the first two periods)
			const olderPeriods = allBillPeriods.slice(2);

			for (const period of olderPeriods) {
				if (!billPeriodsData.has(period.id)) {
					const fetchPeriodData = async () => {
						try {
							const bills = await getBillsForPeriod(period.id);
							setBillPeriodsData((prev) => new Map(prev.set(period.id, bills)));
						} catch (err) {
							console.error(
								`Error fetching data for period ${period.id}:`,
								err,
							);
						}
					};
					fetchPeriodData();
				}
			}
		}
	}, [activeTab, allBillPeriods, isAuthenticated]);

	const handleStatusChange = async (
		entryId: string,
		newStatus: BillingEntry["status"],
	) => {
		if (!isAuthenticated) {
			toast.error("Sie müssen angemeldet sein");
			return;
		}
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

		const originalEntry = currentBilling.find((entry) => entry.id === entryId);
		const originalStatus = originalEntry?.status;

		try {
			setCurrentBilling((prev) =>
				prev.map((entry) =>
					entry.id === entryId ? { ...entry, status: newStatus } : entry,
				),
			);

			const result = await updateBillStatus(entryId, newStatus);

			if (result?.success) {
				toast.success("Status erfolgreich aktualisiert");

				if (newStatus === "Bezahlt") {
					setCurrentBilling((prev) =>
						prev.map((entry) =>
							entry.id === entryId
								? { ...entry, status: newStatus, paidAt: new Date() }
								: entry,
						),
					);
				} else if (newStatus === "Unbezahlt" || newStatus === "Gestundet") {
					setCurrentBilling((prev) =>
						prev.map((entry) =>
							entry.id === entryId
								? { ...entry, status: newStatus, paidAt: null }
								: entry,
						),
					);
				}
			} else {
				setCurrentBilling((prev) =>
					prev.map((entry) =>
						entry.id === entryId ? { ...entry, status: originalStatus } : entry,
					),
				);
				console.error(`Failed to update status for ${entryId}`);
				toast.error(result.error ?? "Fehler beim Aktualisieren des Status");
			}
		} catch (error) {
			// Revert the optimistic update on error
			setCurrentBilling((prev) =>
				prev.map((entry) =>
					entry.id === entryId ? { ...entry, status: originalStatus } : entry,
				),
			);
			console.error("Error updating status:", error);
			toast.error("Fehler beim Aktualisieren des Status");
		}
	};

	return {
		activeTab,
		setActiveTab,
		currentOrders,
		isLoadingOrders,
		ordersError,
		currentBilling,
		isLoadingBilling,
		billingError,
		currentBillPeriod,
		previousBilling,
		isLoadingPreviousBilling,
		previousBillingError,
		previousBillPeriod,
		allBillPeriods,
		billPeriodsData,
		hasRequiredRole,
		handleStatusChange,
	};
}
