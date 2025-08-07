import type { BillingEntry } from "~/app/rechnung/page";
import { Button } from "../ui/button";

// Generic Status Cycle Component
export const StatusButton = ({
  status,
  onStatusChange,
}: {
  status: BillingEntry["status"];
  onStatusChange: (newStatus: BillingEntry["status"]) => void;
}) => {
  const cycleStatus = () => {
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
      default:
        return "bg-red-100 text-red-800 hover:bg-red-200";
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={cycleStatus}
      className={`${getStatusColor(status)} border-0`}
    >
      {status || "Unbezahlt"}
    </Button>
  );
};
