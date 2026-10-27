/** Row shapes the Kasse tab receives from the Getränkewart page. */

export type Summary = {
	kassenstand: number;
	lagerwert: number;
	lagerwertDate: Date | null;
	offeneMitglieder: number;
	gestundetMitglieder: number;
	offeneGruppen: number;
	gestundetGruppen: number;
	pfand: number;
	externOffen: number;
	gesamt: number;
};

export type BankEntry = {
	id: string;
	amount: number;
	description: string;
	date: Date;
	createdAt: Date;
};

export type ExternalBill = {
	id: string;
	creditor: string;
	description: string;
	amount: number;
	status: "Offen" | "Bezahlt";
	paidAt: Date | null;
	createdAt: Date;
};

export type EntityBill = {
	id: string;
	userName: string;
	total: number;
	status: string;
	createdAt: Date;
	items: {
		drinkName: string;
		amount: number;
		pricePerDrink: number;
		totalPricePerDrink: number;
	}[];
};

export type MemberBill = {
	id: string;
	userName: string;
	total: number;
	status: string;
	createdAt: Date;
};

export type BillStatus = "Bezahlt" | "Unbezahlt" | "Gestundet";
