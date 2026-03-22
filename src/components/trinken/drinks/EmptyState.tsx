import { Coffee } from "lucide-react";

export function EmptyState() {
	return (
		<div className="py-12 text-center">
			<Coffee className="mx-auto mb-4 h-16 w-16 text-muted-foreground" />
			<h3 className="mb-2 font-semibold text-lg">Keine Getränke verfügbar</h3>
			<p className="text-muted-foreground">
				Die Getränkekarte muss noch eingerichtet werden. Bitte kontaktieren sie
				ihren Getränkewart oder Admin.
			</p>
		</div>
	);
}
