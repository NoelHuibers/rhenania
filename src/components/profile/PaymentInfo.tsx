"use client";

import { Landmark } from "lucide-react";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import {
	type MyPaymentInfo,
	setMyPaymentInfo,
} from "~/server/actions/cc-kasse/paymentInfo";

/**
 * The member's own account details. `initial` comes from the server (#24);
 * `undefined` renders the disabled form while it streams in.
 */
export function PaymentInfo({ initial }: { initial?: MyPaymentInfo | null }) {
	const loaded = initial !== undefined;
	const [accountHolder, setAccountHolder] = useState(
		initial?.accountHolder ?? "",
	);
	const [iban, setIban] = useState(initial?.iban ?? "");
	const [isPending, startTransition] = useTransition();

	const save = () => {
		startTransition(async () => {
			const res = await setMyPaymentInfo({ accountHolder, iban });
			if (res.success) {
				toast.success("Zahlungsinformationen gespeichert");
			} else {
				toast.error(res.error);
			}
		});
	};

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2">
					<Landmark className="h-5 w-5" />
					Zahlungsinformationen
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-4">
				<p className="text-muted-foreground text-sm">
					Wird bei Kostenerstattungen automatisch vorausgefüllt und kann pro
					Antrag angepasst werden.
				</p>
				<div className="space-y-2">
					<Label htmlFor="payment-holder">Kontoinhaber</Label>
					<Input
						id="payment-holder"
						value={accountHolder}
						onChange={(e) => setAccountHolder(e.target.value)}
						placeholder="Max Mustermann"
						disabled={!loaded || isPending}
					/>
				</div>
				<div className="space-y-2">
					<Label htmlFor="payment-iban">IBAN</Label>
					<Input
						id="payment-iban"
						value={iban}
						onChange={(e) => setIban(e.target.value)}
						placeholder="DE00 0000 0000 0000 0000 00"
						disabled={!loaded || isPending}
					/>
				</div>
				<Button
					onClick={save}
					disabled={
						!loaded || isPending || !accountHolder.trim() || !iban.trim()
					}
					className="w-full"
				>
					Speichern
				</Button>
			</CardContent>
		</Card>
	);
}
