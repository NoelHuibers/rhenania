import { Button } from "../ui/button";
import type { BillingEntry } from "./BillingDashboard";

// Generic Status Cycle Component
export const StatusButton = ({
	status,
	onStatusChange,
}: {
	status: BillingEntry["status"];
	onStatusChange: (newStatus: BillingEntry["status"]) => void;
}) => {
	const cycleStatus = () => {
		// "Übertragen" is system-set (rolled into a later bill) — not user-cyclable.
		if (status === "Übertragen") return;
		const statusOrder: BillingEntry["status"][] = [
			"Unbezahlt",
			"Bezahlt",
			"Gestundet",
		];
		const currentIndex = statusOrder.indexOf(status || "Unbezahlt");
		const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
		onStatusChange(nextStatus);
	};

	const getStatusColor = (status: BillingEntry["status"]) => {
		switch (status) {
			case "Bezahlt":
				return "bg-green-100 text-green-800 hover:bg-green-200";
			case "Gestundet":
				return "bg-yellow-100 text-yellow-800 hover:bg-yellow-200";
			case "Übertragen":
				return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
			default:
				return "bg-red-100 text-red-800 hover:bg-red-200";
		}
	};

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={cycleStatus}
			disabled={status === "Übertragen"}
			title={
				status === "Übertragen"
					? "In eine spätere Rechnung übertragen"
					: undefined
			}
			className={`${getStatusColor(status)} border-0 disabled:opacity-100`}
		>
			{status || "Unbezahlt"}
		</Button>
	);
};
