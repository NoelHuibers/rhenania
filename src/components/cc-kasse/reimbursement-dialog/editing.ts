export type KostenpunktOption = {
	id: string;
	name: string;
	category: string;
};

export type ReceiptFile = { url: string; name: string };

export type EditingReimbursement = {
	id: string;
	kostenpunktId: string;
	kostenpunktName: string;
	kostenpunktCategory: string;
	amount: number;
	description: string;
	recipientName: string;
	iban: string | null;
	expenseDate: Date | number;
	receipts: ReceiptFile[];
};

// Build an EditingReimbursement from a (member or queue) reimbursement row.
export function toEditing(r: {
	id: string;
	kostenpunktId: string;
	amount: number;
	description: string;
	recipientName: string;
	iban: string | null;
	expenseDate: Date | number;
	receipts: ReceiptFile[] | null;
	receiptUrl?: string | null;
	receiptName?: string | null;
	kostenpunkt?: { name: string; category: string } | null;
}): EditingReimbursement {
	return {
		id: r.id,
		kostenpunktId: r.kostenpunktId,
		kostenpunktName: r.kostenpunkt?.name ?? "",
		kostenpunktCategory: r.kostenpunkt?.category ?? "",
		amount: r.amount,
		description: r.description,
		recipientName: r.recipientName,
		iban: r.iban,
		expenseDate: r.expenseDate,
		receipts: r.receipts?.length
			? r.receipts
			: r.receiptUrl
				? [{ url: r.receiptUrl, name: r.receiptName ?? "Beleg" }]
				: [],
	};
}
