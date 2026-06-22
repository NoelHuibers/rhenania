import { Badge } from "~/components/ui/badge";

const CLASS_MAP: Record<string, string> = {
	Eingereicht: "bg-amber-100 text-amber-900 hover:bg-amber-100",
	Genehmigt: "bg-blue-100 text-blue-900 hover:bg-blue-100",
	Ausgezahlt: "bg-green-100 text-green-900 hover:bg-green-100",
	Abgelehnt: "bg-red-100 text-red-900 hover:bg-red-100",
};

export function ReimbursementStatusBadge({ status }: { status: string }) {
	return (
		<Badge variant="secondary" className={CLASS_MAP[status] ?? ""}>
			{status}
		</Badge>
	);
}
