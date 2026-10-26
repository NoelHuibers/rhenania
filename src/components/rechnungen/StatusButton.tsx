import { statusClass } from "~/components/ui/status-badge";
import { billStatusStyle } from "~/lib/status";
import { cn } from "~/lib/utils";
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
		if (status === "Übertragen") {
			return;
		}
		const statusOrder: BillingEntry["status"][] = [
			"Unbezahlt",
			"Bezahlt",
			"Gestundet",
		];
		const currentIndex = statusOrder.indexOf(status || "Unbezahlt");
		const nextStatus = statusOrder[(currentIndex + 1) % statusOrder.length];
		onStatusChange(nextStatus);
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
			className={cn(
				statusClass(billStatusStyle(status)),
				"border-0 hover:brightness-95 disabled:opacity-100",
			)}
		>
			{status || "Unbezahlt"}
		</Button>
	);
};
