import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";

const CLASS_MAP: Record<string, string> = {
	Eingereicht:
		"border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-500/25 dark:bg-amber-500/10 dark:text-amber-300",
	Genehmigt:
		"border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-500/25 dark:bg-sky-500/10 dark:text-sky-300",
	Ausgezahlt:
		"border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-500/25 dark:bg-emerald-500/10 dark:text-emerald-300",
	Abgelehnt:
		"border-red-200 bg-red-50 text-red-700 dark:border-red-500/25 dark:bg-red-500/10 dark:text-red-300",
};

export function ReimbursementStatusBadge({ status }: { status: string }) {
	return (
		<Badge variant="outline" className={cn("font-medium", CLASS_MAP[status])}>
			{status}
		</Badge>
	);
}
