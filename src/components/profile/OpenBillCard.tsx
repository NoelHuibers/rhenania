"use client";

import { Wallet } from "lucide-react";
import { Button } from "~/components/ui/button";
import { BillStatusBadge } from "~/components/ui/status-badge";
import { formatDate, formatEUR } from "~/lib/format";
import { cn } from "~/lib/utils";
import type { OpenBill } from "~/server/lib/open-bill";
import { PAYMENT_DATA_MISSING, PayBillDrawer } from "./PayBillDrawer";

/**
 * "Offene Rechnung: 23,40 €" with its Bezahlen button (#80). `banner` is
 * the compact strip on /trinken, `card` the block on top of the profile.
 */
export function OpenBillCard({
	bill,
	variant = "card",
}: {
	bill: OpenBill;
	variant?: "banner" | "card";
}) {
	const banner = variant === "banner";
	const meta = [
		`Rechnung ${bill.billNumber}`,
		bill.dueDate ? `fällig bis ${formatDate(bill.dueDate)}` : null,
	]
		.filter(Boolean)
		.join(" · ");

	return (
		<section
			aria-label="Offene Getränkerechnung"
			className={cn(
				"rounded-xl border bg-card text-card-foreground",
				banner ? "p-3" : "p-4 shadow-sm",
			)}
		>
			<div
				className={cn(
					"flex gap-3",
					banner ? "items-center" : "flex-col sm:flex-row sm:items-center",
				)}
			>
				<div className="flex min-w-0 flex-1 items-center gap-3">
					{banner ? null : (
						<span
							aria-hidden
							className="hidden size-10 shrink-0 items-center justify-center rounded-full bg-muted sm:flex"
						>
							<Wallet className="size-5" />
						</span>
					)}
					<div className="min-w-0">
						<p className="flex items-center gap-2 text-muted-foreground text-xs">
							Offene Rechnung
							{banner ? null : <BillStatusBadge status="Unbezahlt" />}
						</p>
						<p
							className={cn(
								"font-bold tabular-nums",
								banner ? "text-lg" : "text-2xl",
							)}
						>
							{formatEUR(bill.total)}
						</p>
						<p className="truncate text-muted-foreground text-xs">{meta}</p>
					</div>
				</div>
				{bill.payment ? (
					<PayBillDrawer
						total={bill.total}
						billNumber={bill.billNumber}
						reference={bill.reference}
						payment={bill.payment}
					>
						<Button
							type="button"
							className={cn(
								"shrink-0 text-base",
								banner ? "h-11 px-5" : "h-12 w-full sm:w-auto sm:px-6",
							)}
						>
							Bezahlen
						</Button>
					</PayBillDrawer>
				) : null}
			</div>
			{bill.payment ? null : (
				<p className="mt-2 text-muted-foreground text-sm">
					{PAYMENT_DATA_MISSING}
				</p>
			)}
		</section>
	);
}
