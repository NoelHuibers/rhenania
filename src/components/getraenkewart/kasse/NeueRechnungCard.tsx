"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent } from "~/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { createNewBilling } from "~/server/modules/billing/actions";

/** Starts a new billing period for the current orders, after a confirmation. */
export function NeueRechnungCard() {
	const router = useRouter();
	const [open, setOpen] = useState(false);
	const [isPending, startTransition] = useTransition();

	function handleCreate() {
		startTransition(async () => {
			setOpen(false);
			const result = await createNewBilling();
			if (result.ok) {
				toast.success("Neue Rechnung erfolgreich erstellt");
				router.refresh();
			} else {
				toast.error(result.error);
			}
		});
	}

	return (
		<Card>
			<CardContent className="flex items-center justify-between p-5">
				<div>
					<p className="font-semibold">Neue Rechnung</p>
					<p className="text-muted-foreground text-sm">
						Aktuelle Bestellungen abrechnen
					</p>
				</div>
				<Dialog open={open} onOpenChange={setOpen}>
					<DialogTrigger asChild>
						<Button disabled={isPending}>
							<Plus className="mr-2 size-4" />
							Erstellen
						</Button>
					</DialogTrigger>
					<DialogContent>
						<DialogHeader>
							<DialogTitle>Neue Rechnung erstellen</DialogTitle>
							<DialogDescription>
								Diese Aktion kann nicht rückgängig gemacht werden. Sind Sie sich
								sicher, dass Sie eine neue Abrechnungsperiode erstellen möchten?
							</DialogDescription>
						</DialogHeader>
						<DialogFooter>
							<Button
								variant="outline"
								onClick={() => setOpen(false)}
								disabled={isPending}
							>
								Abbrechen
							</Button>
							<Button onClick={handleCreate} disabled={isPending}>
								{isPending ? (
									<>
										<Loader2 className="mr-2 size-4 animate-spin" />
										Erstelle...
									</>
								) : (
									"Ja, erstellen"
								)}
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			</CardContent>
		</Card>
	);
}
