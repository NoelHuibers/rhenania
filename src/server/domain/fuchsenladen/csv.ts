// csv.ts — a Fuchsenladen bill period as CSV.
//
// Pure: one semicolon-delimited row per bill (by name) and a total row,
// amounts with a decimal comma, with a BOM for Excel. The Fuchsenladen
// service reads the period and its bills.

import { csvRow } from "~/lib/csv";

export function fuchsenPeriodCsv(
	period: { billNumber: string; totalAmount: number },
	bills: {
		userName: string;
		status: string;
		itemsTotal: number;
		oldBillingAmount: number;
		total: number;
	}[],
): { csvContent: string; fileName: string } {
	const fmt = (n: number) => n.toFixed(2).replace(".", ",");
	const lines = [
		csvRow(["Name", "Status", "Artikel", "Alter Saldo", "Gesamt"], ";"),
		...bills.map((b) =>
			csvRow(
				[
					b.userName,
					b.status,
					fmt(b.itemsTotal),
					fmt(b.oldBillingAmount),
					fmt(b.total),
				],
				";",
			),
		),
		csvRow(["Gesamt", "", "", "", fmt(period.totalAmount)], ";"),
	];

	return {
		csvContent: `﻿${lines.join("\r\n")}`,
		fileName: `Fuchsenrechnung_${period.billNumber}.csv`,
	};
}
