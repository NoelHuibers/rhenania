"use client";

import { Loader2, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { GetraenkeBillingCard } from "~/components/getraenkewart/GetraenkeBillingCard";
import { GetraenkeSettingsCard } from "~/components/getraenkewart/GetraenkeSettingsCard";
import { BankLog } from "~/components/getraenkewart/kasse/BankLog";
import { EntityBillsCard } from "~/components/getraenkewart/kasse/EntityBillsCard";
import { ExternalBillsCard } from "~/components/getraenkewart/kasse/ExternalBillsCard";
import { MemberBillsCard } from "~/components/getraenkewart/kasse/MemberBillsCard";
import { SummarySection } from "~/components/getraenkewart/kasse/SummarySection";
import type {
	BankEntry,
	EntityBill,
	ExternalBill,
	MemberBill,
	Summary,
} from "~/components/getraenkewart/kasse/types";
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
import { createNewBilling } from "~/server/actions/billings/billings";
import type {
	GetraenkeBillingSettings,
	GetraenkeSettings,
} from "~/server/actions/getraenkewart/kasse";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = {
	summary: Summary;
	bankEntries: BankEntry[];
	externalBills: ExternalBill[];
	entityBills: EntityBill[];
	memberBills: MemberBill[];
	pfandWert: number;
	/** Feature settings; null for tenants without markup / treasurer features. */
	settings?: GetraenkeSettings | null;
	/** Sender and account of the bills; null for non-Getränkewarte. */
	billing?: GetraenkeBillingSettings | null;
};

// ─── Neue Rechnung ────────────────────────────────────────────────────────────

function NeueRechnungCard() {
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

// ─── KasseTab ─────────────────────────────────────────────────────────────────

export function KasseTab({
	summary,
	bankEntries,
	externalBills,
	entityBills,
	memberBills,
	pfandWert,
	settings = null,
	billing = null,
}: Props) {
	return (
		<div className="flex flex-col gap-6">
			<SummarySection summary={summary} pfandWert={pfandWert} />
			{billing && <GetraenkeBillingCard settings={billing} />}
			{settings && <GetraenkeSettingsCard settings={settings} />}
			<NeueRechnungCard />
			<BankLog entries={bankEntries} />
			<MemberBillsCard bills={memberBills} />
			<EntityBillsCard bills={entityBills} />
			<ExternalBillsCard bills={externalBills} />
		</div>
	);
}
