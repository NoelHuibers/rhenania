import { Badge } from "~/components/ui/badge";
import { cn } from "~/lib/utils";
import { memberStatusClasses } from "./member-constants";

export function MemberStatusBadge({
	status,
	className,
}: {
	status: string;
	className?: string;
}) {
	return (
		<Badge
			variant="outline"
			className={cn("font-medium", memberStatusClasses(status), className)}
		>
			{status || "—"}
		</Badge>
	);
}
