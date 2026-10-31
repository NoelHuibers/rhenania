"use client";

import { Check, Copy, ExternalLink } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type ReactNode, useState } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import {
	Drawer,
	DrawerContent,
	DrawerDescription,
	DrawerHeader,
	DrawerTitle,
	DrawerTrigger,
} from "~/components/ui/drawer";
import { IconButton } from "~/components/ui/icon-button";
import { Separator } from "~/components/ui/separator";
import { girocodePayload, paypalAmountUrl } from "~/lib/bill-payment";
import { formatDecimalInput, formatEUR } from "~/lib/format";
import type { GetraenkekassePayment } from "~/server/domain/getraenkekasse/payment";

/** Shown wherever a pay button would be, when the Corps has no payment data. */
export const PAYMENT_DATA_MISSING =
	"Zahlungsdaten nicht hinterlegt. Bitte wende dich an den Getränkewart.";

export type PayBillProps = {
	total: number;
	billNumber: string;
	/** Verwendungszweck and PayPal note. */
	reference: string;
	payment: GetraenkekassePayment;
};

/**
 * "Bezahlen" opens this sheet; the PayPal handoff and every IBAN field are
 * one more tap away (#80). `children` is the trigger button.
 */
export function PayBillDrawer({
	children,
	...bill
}: PayBillProps & { children: ReactNode }) {
	return (
		<Drawer>
			<DrawerTrigger asChild>{children}</DrawerTrigger>
			<DrawerContent className="max-h-[90vh]">
				<DrawerHeader>
					<DrawerTitle className="text-lg">
						Rechnung {bill.billNumber} bezahlen
					</DrawerTitle>
					<DrawerDescription className="font-semibold text-foreground text-xl tabular-nums">
						{formatEUR(bill.total)}
					</DrawerDescription>
				</DrawerHeader>
				<div className="overflow-y-auto px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
					<PayBillOptions {...bill} />
				</div>
			</DrawerContent>
		</Drawer>
	);
}

function PayBillOptions({
	total,
	reference,
	payment,
}: Omit<PayBillProps, "billNumber">) {
	const [copied, setCopied] = useState<string | null>(null);

	const copy = (text: string, field: string) => {
		void navigator.clipboard.writeText(text).then(
			() => {
				setCopied(field);
				toast.success(`${field} kopiert`);
				setTimeout(() => setCopied(null), 2000);
			},
			() => toast.error("Kopieren nicht möglich"),
		);
	};

	const rows = [
		{
			label: "Kontoinhaber",
			value: payment.accountHolder,
			copy: payment.accountHolder,
		},
		{ label: "IBAN", value: payment.iban, copy: payment.ibanRaw, mono: true },
		{
			label: "Betrag",
			value: formatEUR(total),
			copy: formatDecimalInput(total),
		},
		{ label: "Verwendungszweck", value: reference, copy: reference },
	];

	const copyButton = (label: string, text: string) => (
		<IconButton
			label={`${label} kopieren`}
			tooltip={false}
			className="shrink-0"
			onClick={() => copy(text, label)}
		>
			{copied === label ? (
				<Check className="size-4 text-success" />
			) : (
				<Copy className="size-4" />
			)}
		</IconButton>
	);

	return (
		<div className="space-y-4">
			{payment.paypalBaseUrl ? (
				<section aria-label="PayPal" className="space-y-2">
					<Button asChild className="h-12 w-full text-base">
						<a
							href={paypalAmountUrl(payment.paypalBaseUrl, total)}
							target="_blank"
							rel="noopener noreferrer"
						>
							Mit PayPal bezahlen
							<ExternalLink className="size-4" />
						</a>
					</Button>
					<div className="flex items-center justify-between gap-2 text-sm">
						<p className="min-w-0 text-muted-foreground">
							Freunde &amp; Familie, Notiz:{" "}
							<span className="wrap-break-word text-foreground">
								{reference}
							</span>
						</p>
						{copyButton("Notiz", reference)}
					</div>
					<Separator />
				</section>
			) : null}

			<section aria-label="Überweisung" className="space-y-2">
				<h3 className="font-medium text-sm">Überweisung</h3>
				<div className="divide-y rounded-lg border">
					{rows.map((row) => (
						<div
							key={row.label}
							className="flex min-h-14 items-center justify-between gap-2 py-1 pr-1 pl-3"
						>
							<div className="min-w-0">
								<p className="text-muted-foreground text-xs">{row.label}</p>
								<p
									className={`wrap-break-word text-sm ${row.mono ? "font-mono" : "font-medium"}`}
								>
									{row.value}
								</p>
							</div>
							{copyButton(row.label, row.copy)}
						</div>
					))}
				</div>
				<div className="flex items-center gap-3 rounded-lg border p-3">
					<div className="shrink-0 rounded bg-white p-1.5">
						<QRCodeSVG
							value={girocodePayload({
								accountHolder: payment.accountHolder,
								ibanRaw: payment.ibanRaw,
								amount: total,
								reference,
							})}
							size={88}
							level="M"
						/>
					</div>
					<p className="text-muted-foreground text-xs">
						GiroCode: mit der Banking-App eines anderen Geräts scannen, alle
						Felder sind dann ausgefüllt.
					</p>
				</div>
			</section>
		</div>
	);
}
