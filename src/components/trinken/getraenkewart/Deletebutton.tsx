import { Trash2 } from "lucide-react";

import { ConfirmAction } from "~/components/ui/confirm-action";
import { IconButton } from "~/components/ui/icon-button";

export function DeleteButton({
	onConfirm,
	disabled,
	label,
}: {
	onConfirm: () => void;
	disabled?: boolean;
	label?: string;
}) {
	return (
		<ConfirmAction
			title="Getränk löschen?"
			description="Das Getränk wird dauerhaft aus der Karte entfernt. Das lässt sich nicht rückgängig machen."
			onConfirm={onConfirm}
		>
			<IconButton label={label || "Löschen"} disabled={disabled}>
				<Trash2 />
			</IconButton>
		</ConfirmAction>
	);
}
