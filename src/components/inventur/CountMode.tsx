"use client";

import { FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Checkbox } from "~/components/ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Label } from "~/components/ui/label";
import {
	closeInventoryAndBill,
	type InventoryCountItem,
	saveInventoryCount,
} from "~/server/actions/inventur/inventur";
import type { StockStatusWithDetails } from "./utils";

/** Toasts the outcome of a full inventory; true when it was saved. */
function notifyInventory(
	result: Awaited<ReturnType<typeof saveInventoryCount>>,
): boolean {
	if (!result.ok) {
		toast.error(result.error);
		return false;
	}
	toast.success("Inventur erfolgreich erstellt");
	return true;
}

/** Toasts which step of "Inventur + Rechnung" failed; true when the inventory was saved. */
function notifyInventoryAndBilling(
	result: Awaited<ReturnType<typeof closeInventoryAndBill>>,
): boolean {
	if (result.ok) {
		if (result.data.billsCreated > 0) {
			toast.success("Inventur und Rechnung erfolgreich erstellt");
		} else {
			toast.warning(
				`Inventur gespeichert, keine Rechnung erstellt: ${result.data.message}`,
			);
		}
		return true;
	}
	// A billing failure leaves the inventory closed: only billing is missing.
	toast.error(result.error);
	return result.code === "BILLING_FAILED";
}

/**
 * Saves a full inventory, with billing when asked, and toasts the outcome.
 * True when the inventory was saved (even if the billing then failed).
 */
export async function submitInventory(
	items: InventoryCountItem[],
	withInvoice: boolean,
): Promise<boolean> {
	if (withInvoice) {
		return notifyInventoryAndBilling(await closeInventoryAndBill(items));
	}
	return notifyInventory(await saveInventoryCount(items));
}

/** Lists the drinks nobody counted and asks before taking their shown "Ist". */
function UncountedWarning({
	uncounted,
	total,
	accepted,
	onAcceptedChange,
}: {
	uncounted: StockStatusWithDetails[];
	total: number;
	accepted: boolean;
	onAcceptedChange: (accepted: boolean) => void;
}) {
	if (uncounted.length === 0) {
		return null;
	}
	return (
		<div className="rounded-md border border-warning/40 bg-warning-muted p-3 text-sm">
			<p className="font-medium">
				{uncounted.length} von {total} Getränken wurden nicht gezählt:
			</p>
			<p className="mt-1 max-h-24 overflow-y-auto text-muted-foreground">
				{uncounted.map((item) => item.drinkName).join(", ")}
			</p>
			<div className="mt-3 flex items-start space-x-2">
				<Checkbox
					id="accept-uncounted"
					checked={accepted}
					onCheckedChange={(checked) => onAcceptedChange(checked === true)}
				/>
				<Label
					htmlFor="accept-uncounted"
					className="font-normal text-sm leading-snug"
				>
					Für nicht gezählte Getränke den angezeigten Ist-Wert übernehmen
				</Label>
			</div>
		</div>
	);
}

/** Confirms a full inventory ("Vollständige Inventur"), optionally with a bill. */
export function InventoryCountDialog({
	open,
	onOpenChange,
	totalSoldUnits,
	uncounted,
	total,
	acceptUncounted,
	onAcceptUncountedChange,
	createInvoice,
	onCreateInvoiceChange,
	isSaving,
	blocked,
	onCreate,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	totalSoldUnits: number;
	uncounted: StockStatusWithDetails[];
	total: number;
	acceptUncounted: boolean;
	onAcceptUncountedChange: (accepted: boolean) => void;
	createInvoice: boolean;
	onCreateInvoiceChange: (createInvoice: boolean) => void;
	isSaving: boolean;
	blocked: boolean;
	onCreate: (withInvoice: boolean) => void;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Vollständige Inventur erstellen</DialogTitle>
					<DialogDescription>
						Die Inventur wird mit den aktuellen Bestandszahlen erstellt.
						{totalSoldUnits > 0 && (
							<span className="mt-2 block">
								Es wurden <strong>{totalSoldUnits} Flaschen</strong> seit der
								letzten Inventur verkauft.
							</span>
						)}
					</DialogDescription>
				</DialogHeader>
				<UncountedWarning
					uncounted={uncounted}
					total={total}
					accepted={acceptUncounted}
					onAcceptedChange={onAcceptUncountedChange}
				/>
				<div className="flex items-center space-x-2 py-4">
					<Checkbox
						id="create-invoice"
						checked={createInvoice}
						onCheckedChange={(checked) =>
							onCreateInvoiceChange(checked as boolean)
						}
					/>
					<Label
						htmlFor="create-invoice"
						className="font-medium text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
					>
						Auch Rechnung erstellen
					</Label>
				</div>
				<DialogFooter className="flex gap-2">
					<Button variant="outline" onClick={() => onOpenChange(false)}>
						Abbrechen
					</Button>
					<Button
						onClick={() => onCreate(createInvoice)}
						disabled={isSaving || blocked}
					>
						{isSaving ? (
							"Erstelle..."
						) : (
							<>
								<FileSpreadsheet className="mr-2 h-4 w-4" />
								Inventur erstellen
							</>
						)}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
