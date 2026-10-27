/** Row shapes shared by the Getränke billing views. */

export interface DrinkItem {
	id: string;
	name: string;
	quantity: number;
	unitPrice: number;
	subtotal: number;
}

export interface BillingEntry {
	id: string;
	name: string;
	totalDue: number;
	status?: "Bezahlt" | "Unbezahlt" | "Gestundet" | "Übertragen";
	items: DrinkItem[];
	paidAt?: Date | null;
	/** Parts of a bill beyond its drinks (absent for unbilled orders). */
	oldBillingAmount?: number;
	fees?: number;
	umlage?: number;
}

export interface BillPeriod {
	id: string;
	billNumber: string;
	createdAt: Date | string;
	totalAmount: number;
}
