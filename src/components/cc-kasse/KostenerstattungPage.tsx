"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { SiteHeader } from "~/components/trinken/SiteHeader";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import type { MyReimbursement } from "~/server/actions/cc-kasse/kostenerstattungen";
import { MyReimbursementsTable } from "./MyReimbursementsTable";
import {
	type KostenpunktOption,
	ReimbursementDialog,
} from "./ReimbursementDialog";

type Props = {
	reimbursements: MyReimbursement[];
	paymentInfo: { accountHolder: string; iban: string } | null;
	kostenpunkte: KostenpunktOption[];
};

export function KostenerstattungPage({
	reimbursements,
	paymentInfo,
	kostenpunkte,
}: Props) {
	const router = useRouter();
	const [open, setOpen] = useState(false);

	return (
		<div className="flex flex-col">
			<SiteHeader title="Kostenerstattung" />
			<div className="space-y-4 p-4 md:p-6">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-muted-foreground text-sm">
						Belege einreichen und deine Erstattungen verfolgen.
					</p>
					<Button
						onClick={() => setOpen(true)}
						disabled={kostenpunkte.length === 0}
					>
						<Plus className="mr-2 h-4 w-4" /> Neue Kostenerstattung
					</Button>
				</div>

				{kostenpunkte.length === 0 && (
					<p className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
						Aktuell ist kein aktiver Etatplan mit Kostenpunkten vorhanden.
					</p>
				)}

				<Card>
					<CardHeader>
						<CardTitle>Meine Anträge</CardTitle>
					</CardHeader>
					<CardContent>
						<MyReimbursementsTable reimbursements={reimbursements} />
					</CardContent>
				</Card>
			</div>

			<ReimbursementDialog
				open={open}
				onOpenChange={setOpen}
				kostenpunkte={kostenpunkte}
				mode="member"
				defaultPaymentInfo={paymentInfo}
				onSaved={() => router.refresh()}
			/>
		</div>
	);
}
