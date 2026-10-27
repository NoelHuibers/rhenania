"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Badge } from "~/components/ui/badge";
import { Card, CardContent } from "~/components/ui/card";
import { IconButton } from "~/components/ui/icon-button";
import type { Konto } from "~/server/actions/kontos/kontos";

/** One bank account with its edit and (admin-only) delete actions. */
export function KontoCard({
	konto,
	isAdmin,
	onEdit,
	onDelete,
}: {
	konto: Konto;
	isAdmin: boolean;
	onEdit: (k: Konto) => void;
	onDelete: (id: string) => void;
}) {
	const formatted = (raw: string) => raw.replace(/(.{4})/g, "$1 ").trim();

	return (
		<Card className={konto.isActive ? "" : "opacity-60"}>
			<CardContent className="flex items-start justify-between gap-4 p-4">
				<div className="min-w-0 flex-1 space-y-1">
					<div className="flex flex-wrap items-center gap-2">
						<span className="font-medium">{konto.kasseType}</span>
						{!konto.isActive && (
							<Badge variant="outline" className="text-muted-foreground">
								Inaktiv
							</Badge>
						)}
					</div>
					<p className="font-mono text-muted-foreground text-sm">
						{formatted(konto.iban)}
					</p>
					<p className="text-muted-foreground text-sm">
						BIC: {konto.bic} · {konto.bankName}
					</p>
					{konto.paypalLink && (
						<p className="truncate text-muted-foreground text-sm">
							PayPal: {konto.paypalLink}
						</p>
					)}
					{konto.description && (
						<p className="text-muted-foreground text-sm">{konto.description}</p>
					)}
				</div>
				<div className="flex shrink-0 gap-1">
					<IconButton label="Kasse bearbeiten" onClick={() => onEdit(konto)}>
						<Pencil className="h-4 w-4" />
					</IconButton>
					{isAdmin && (
						<IconButton
							label="Kasse löschen"
							onClick={() => onDelete(konto.id)}
							className="text-destructive hover:text-destructive"
						>
							<Trash2 className="h-4 w-4" />
						</IconButton>
					)}
				</div>
			</CardContent>
		</Card>
	);
}
