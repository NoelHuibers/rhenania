import { CheckCircle, Clock } from "lucide-react";

export function MenuFooter() {
	return (
		<div className="mt-12 space-y-4 border-t pt-8 text-center">
			<div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
				<CheckCircle className="h-4 w-4 text-green-500" />
				<span>"Man muss gewinnen, was man gewinnen will"</span>
			</div>
			<div className="flex items-center justify-center gap-2 text-muted-foreground text-sm">
				<Clock className="h-4 w-4 text-orange-500" />
				<span>Die Verfügbarkeit kann sich kurzfristig ändern</span>
			</div>
		</div>
	);
}
