"use client";

import type { BillingEntry } from "~/components/rechnungen/BillingDashboard";
import type {
	FuchsenBillingConfig,
	FuchsenBillingEntry,
} from "~/server/modules/fuchsenladen/actions";
import { FuchsenBillDetailsDialog } from "./FuchsenBillDetailsDialog";

/** Factory: a details dialog bound to the current billing config. */
export function makeDetails(config: FuchsenBillingConfig) {
	// The shared BillingTable types detailsComponent for BillingEntry. Fuchsen
	// bills carry the FuchsenBillingEntry shape (items total instead of drinks
	// and fees), so narrow it back here.
	return function Details({ entry }: { entry: BillingEntry }) {
		return (
			<FuchsenBillDetailsDialog
				entry={entry as FuchsenBillingEntry}
				config={config}
			/>
		);
	};
}
