// service.ts — Getränke bills: reads, status changes and documents (#33).
//
// Domain rules on top of ./repo. Every function takes the TenantScope it
// works in; failures the user should read are DomainErrors, anything else
// (a failed query) propagates. The billing run is in ./run.

import "server-only";

import { head, put } from "@vercel/blob";
import { paymentReference } from "~/lib/bill-payment";
import { roundToCent } from "~/lib/money";
import { addDaysInTZ, dayKeyInTZ, getZonedParts } from "~/lib/time";
import { billPeriodCsv } from "~/server/domain/billing/csv";
import {
	ConflictError,
	DomainError,
	NotFoundError,
	ValidationError,
} from "~/server/lib/domain-error";
import {
	type GetraenkekassePayment,
	getActiveGetraenkekasseKontos,
	getGetraenkeBillingProfile,
	getGetraenkekassePayment,
	incompleteBillingMessage,
	resolveGetraenkeBillSender,
	resolveGetraenkekassePayment,
} from "~/server/lib/getraenkekasse-payment";
import { groupBy } from "~/server/lib/group-by";
import { log } from "~/server/lib/log";
import { getTenantById } from "~/server/lib/tenant-context";
import type { TenantScope } from "~/server/lib/tenant-scope";
import { buildUserBillData } from "~/server/lib/user-bill-data";
import {
	renderUserBillPDF,
	userBillPdfFileName,
} from "~/server/lib/user-bill-pdf";
import * as repo from "./repo";

// ─── Periods and bills ───────────────────────────────────────────────────────

/** Every bill period, newest first. */
export async function listBillPeriods({ db }: TenantScope) {
	return repo.listPeriods(db);
}

/** A period's bills by name, each with its items, in one round trip. */
export async function billsForPeriod(
	{ db }: TenantScope,
	billPeriodId: string,
) {
	const { bills, items } = await repo.periodBillsWithItems(db, billPeriodId);
	const itemsByBill = groupBy(items, (item) => item.billId);
	return bills.map((bill) => ({
		id: bill.id,
		name: bill.userName,
		totalDue: bill.total,
		status: bill.status,
		oldBillingAmount: bill.oldBillingAmount,
		drinksTotal: bill.drinksTotal,
		fees: bill.fees,
		umlage: bill.umlage,
		items: (itemsByBill.get(bill.id) ?? []).map((item) => ({
			id: item.id,
			name: item.drinkName,
			quantity: item.amount,
			unitPrice: item.pricePerDrink,
			subtotal: item.totalPricePerDrink,
		})),
	}));
}

/**
 * Sets a bill's status from the Kasse. "Übertragen" is set by billing runs
 * only. Carried bills and bills paid through the later bill they were
 * carried into change only through that later bill (see carried-bills).
 */
export async function setBillStatus(
	{ db, now }: TenantScope,
	billId: string,
	newStatus: repo.BillStatus,
): Promise<void> {
	if (newStatus === "Übertragen") {
		throw new ValidationError("Ungültiger Status");
	}
	const bill = await repo.findBill(db, billId);
	if (!bill) {
		throw new NotFoundError("Rechnung nicht gefunden");
	}
	// Gruppenrechnungen are settled directly and never carried.
	const carries = !bill.userId.startsWith("event-");
	const refusal = carries ? await repo.carriedRefusal(db, bill) : null;
	if (refusal) {
		throw new ConflictError(refusal, "CARRIED_BILL");
	}
	// Paying a paid bill again would move its paidAt away from the bills
	// it settled, and with it the link to them.
	if (bill.status === newStatus) {
		return;
	}

	// The carried ("Übertragen") bills of the member were rolled into this
	// bill's Übertrag, so paying it pays them too; undoing a payment reopens
	// the bills it settled, as carried.
	const cascade = !carries
		? null
		: newStatus === "Bezahlt"
			? "payCarried"
			: bill.status === "Bezahlt"
				? "reopenSettled"
				: null;
	await repo.setBillStatus(db, bill, newStatus, now(), cascade);
}

// ─── The member's own bill ───────────────────────────────────────────────────

export type OpenBill = {
	billId: string;
	billNumber: string;
	total: number;
	/** Last day to pay (YYYY-MM-DD, Berlin), from the bill date and the Kasse's payment terms. */
	dueDate: string | null;
	/** Verwendungszweck and PayPal note. */
	reference: string;
	/** Where to pay; null while the Corps has not set up its Getränkekasse. */
	payment: GetraenkekassePayment | null;
};

/**
 * Whether the member still has to pay this (their latest) bill. Paid,
 * deferred (Gestundet) and carried-over bills are not open, and neither is
 * a bill that comes to nothing.
 */
export function isOpenBill(
	bill: { status: string; total: number } | null | undefined,
): boolean {
	return !!bill && bill.status === "Unbezahlt" && roundToCent(bill.total) > 0;
}

/**
 * "You have an open bill of 23,40 €" (#80): the member's latest bill while
 * it still has to be paid, with everything the pay button needs. The
 * payment target is the one the bill PDF prints. Null when there is
 * nothing to pay.
 */
export async function openBillOf(
	{ db, tenantId }: TenantScope,
	userId: string,
): Promise<OpenBill | null> {
	const latest = await repo.latestBillOf(db, userId);
	if (!latest || !isOpenBill(latest)) {
		return null;
	}

	const [tenant, activeKontos, profile] = await Promise.all([
		getTenantById(tenantId),
		getActiveGetraenkekasseKontos(),
		getGetraenkeBillingProfile(),
	]);
	const billNumber = latest.billNumber ?? "N/A";
	const billedAt = latest.periodCreatedAt ?? latest.createdAt;
	return {
		billId: latest.id,
		billNumber,
		total: roundToCent(latest.total),
		dueDate:
			profile.paymentDueDays > 0
				? dayKeyInTZ(addDaysInTZ(billedAt, profile.paymentDueDays))
				: null,
		reference: paymentReference(latest.userName, billNumber),
		payment: resolveGetraenkekassePayment(
			activeKontos,
			profile.accountHolder,
			tenant?.branding?.paypalUrl,
		),
	};
}

export type BillData = {
	status: repo.BillStatus;
	total: number;
	drinksTotal: number;
	fees: number;
	oldBalance: number;
	billNumber: string;
	lastUpdated: string;
	umlage: number;
	billId: string;
	userName: string;
};

export type BillItem = {
	item: string;
	quantity: number;
	price: number;
	total: number;
};

export type UserBillingData = {
	billData: BillData | null;
	billItems: BillItem[];
	/** Where to pay: same account + PayPal link the bill PDF prints. */
	payment: GetraenkekassePayment | null;
};

/** The member's latest bill for the profile, with its items. */
export async function userBillingData(
	{ db }: TenantScope,
	userId: string,
): Promise<UserBillingData> {
	const latest = await repo.latestBillWithPeriod(db, userId);
	if (!latest) {
		return { billData: null, billItems: [], payment: null };
	}
	const { bill, billPeriod } = latest;
	const [items, payment] = await Promise.all([
		repo.itemsOf(db, bill.id),
		getGetraenkekassePayment(),
	]);

	const billItems: BillItem[] = items.map((item) => ({
		item: item.drinkName,
		quantity: item.amount,
		price: item.pricePerDrink,
		total: item.totalPricePerDrink,
	}));
	// Fees as a separate item if there are any.
	if (bill.fees > 0) {
		billItems.push({
			item: "Service Fee",
			quantity: 1,
			price: bill.fees,
			total: bill.fees,
		});
	}

	return {
		billData: {
			status: bill.status,
			total: bill.total,
			drinksTotal: bill.drinksTotal,
			fees: bill.fees,
			oldBalance: bill.oldBillingAmount,
			umlage: bill.umlage,
			billNumber: billPeriod?.billNumber?.toString() ?? "N/A",
			lastUpdated: dayKeyInTZ(bill.updatedAt ?? bill.createdAt),
			billId: bill.id,
			userName: bill.userName,
		},
		billItems,
		payment,
	};
}

// ─── Documents ───────────────────────────────────────────────────────────────

const PDF_FAILED = "PDF_FAILED";

/**
 * A stored bill as PDF, with the tenant's own sender and payment target
 * (the data the profile page shows; no fallback to anybody else's).
 */
export async function billPdf(
	{ db }: TenantScope,
	billId: string,
): Promise<{ pdf: Buffer; fileName: string }> {
	const stored = await repo.billWithPeriodAndItems(db, billId);
	if (!stored) {
		throw new NotFoundError("Rechnung nicht gefunden", PDF_FAILED);
	}
	const { bill, billPeriod, items } = stored;
	if (!billPeriod) {
		throw new NotFoundError("Abrechnung nicht gefunden", PDF_FAILED);
	}
	const resolved = await resolveGetraenkeBillSender();
	if (!resolved.ok) {
		throw new ValidationError(
			incompleteBillingMessage(resolved.missing),
			PDF_FAILED,
		);
	}
	// What the PDF shows: the stored parts of the bill, Umlage included,
	// which add up to the stored total.
	return {
		pdf: renderUserBillPDF(
			buildUserBillData(bill, billPeriod, items),
			resolved.sender,
		),
		fileName: userBillPdfFileName(billPeriod.billNumber, bill.userName),
	};
}

const CSV_UNAVAILABLE =
	"Für diese Abrechnung konnte keine CSV erstellt werden.";

/** A period's bills as the Kasse's CSV sheet. */
export async function periodCsv(
	{ db }: TenantScope,
	billPeriodId: string,
	options: { paypalBaseUrl?: string; delimiter?: string } = {},
) {
	const { period, drinks, bills, items } = await repo.periodForCsv(
		db,
		billPeriodId,
	);
	// An unknown period, or one without bills, has nothing to export.
	if (!period || bills.length === 0) {
		throw new NotFoundError(CSV_UNAVAILABLE, "CSV_FAILED");
	}
	// The tenant's own PayPal (same as on the bill PDF); no link without one.
	const paypalBaseUrl =
		options.paypalBaseUrl ||
		(await getGetraenkekassePayment())?.paypalBaseUrl ||
		null;
	const itemsByBill = groupBy(items, (item) => item.billId);
	const sheet = billPeriodCsv({
		bills: bills.map((bill) => ({
			...bill,
			items: itemsByBill.get(bill.id) ?? [],
		})),
		drinks,
		billNumber: period.billNumber,
		paypalBaseUrl,
		delimiter: options.delimiter || ",",
	});
	return {
		...sheet,
		fileName: `Rechnung_${period.billNumber}.csv`,
		createdAt: period.createdAt,
	};
}

const MONTHS = [
	"Jan",
	"Feb",
	"Mär",
	"Apr",
	"Mai",
	"Jun",
	"Jul",
	"Aug",
	"Sep",
	"Okt",
	"Nov",
	"Dez",
];

/** Polls until a fresh upload is readable (Blob is eventually consistent). */
async function waitForBlob(url: string) {
	const maxRetries = 10;
	for (let retries = 1; ; retries++) {
		try {
			await head(url);
			return;
		} catch {
			if (retries >= maxRetries) {
				throw new Error(
					"Blob upload timed out - file may not be immediately available",
				);
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
	}
}

/**
 * The period's CSV in Blob storage under `tenants/<slug>/bills/`: the
 * stored one while its blob exists, otherwise a new upload.
 */
export async function savePeriodCsv(
	scope: TenantScope,
	billPeriodId: string,
	options: { paypalBaseUrl?: string; delimiter?: string } = {},
) {
	const { db, tenantId } = scope;
	const tenant = await getTenantById(tenantId);
	if (!tenant) {
		throw new NotFoundError("Corps nicht gefunden");
	}
	const delimiter = options.delimiter || ";";

	const existing = await repo.findPeriodCsv(db, billPeriodId);
	if (existing) {
		try {
			await head(existing.blobUrl);
			return {
				csvId: existing.id,
				downloadUrl: existing.blobUrl,
				fileName: existing.fileName,
				wasExisting: true,
			};
		} catch {
			await log.warn("bill csv blob missing, regenerating", {
				csvId: existing.id,
			});
			await repo.deletePeriodCsv(db, existing.id);
		}
	}

	// Written with the delimiter recorded below.
	const sheet = await periodCsv(scope, billPeriodId, { ...options, delimiter });
	// The Berlin calendar day of the run, whatever the server's zone.
	const date = getZonedParts(new Date(sheet.createdAt));
	const day = date.day.toString().padStart(2, "0");
	const fileName = `tenants/${tenant.slug}/bills/Rechnung_${day}_${MONTHS[date.month - 1]}_${date.year}.csv`;

	const blob = await put(fileName, sheet.csvContent, {
		access: "public",
		contentType: "text/csv;charset=utf-8",
		// Public blobs are readable by anyone with the URL: never make the
		// URL guessable from the period, date or member name.
		addRandomSuffix: true,
	});
	await waitForBlob(blob.url);

	const csvId = await repo.insertPeriodCsv(db, {
		billPeriodId,
		blobUrl: blob.url,
		fileName,
		delimiter,
		fileSize: new Blob([sheet.csvContent]).size,
	});
	return { csvId, downloadUrl: blob.url, fileName, wasExisting: false };
}

/**
 * The member's own bill as PDF in Blob storage: the stored one while its
 * blob exists, otherwise a new upload. Bills of other members are refused.
 */
export async function saveUserBillPdf(
	scope: TenantScope,
	member: { id: string; name: string | null },
	billId: string,
) {
	const { db, tenantId } = scope;
	const bill = await repo.findBill(db, billId);
	if (!bill) {
		throw new NotFoundError("Bill not found");
	}
	if (bill.userId !== member.id) {
		throw new DomainError(
			"Unauthorized: This bill does not belong to you",
			"FORBIDDEN",
		);
	}

	const existing = await repo.findBillPdf(db, billId);
	if (existing) {
		try {
			await head(existing.blobUrl);
			return {
				pdfId: existing.id,
				downloadUrl: existing.blobUrl,
				fileName: existing.fileName,
				wasExisting: true,
			};
		} catch {
			await log.warn("bill pdf blob missing, regenerating", {
				pdfId: existing.id,
			});
			await repo.deleteBillPdf(db, existing.id);
		}
	}

	const { pdf, fileName } = await billPdf(scope, billId);
	const tenant = await getTenantById(tenantId);
	if (!tenant) {
		throw new NotFoundError("Corps nicht gefunden");
	}
	const blob = await put(
		`tenants/${tenant.slug}/bills/${member.name}/${fileName}`,
		pdf,
		{
			access: "public",
			contentType: "application/pdf",
			// Public blobs are readable by anyone with the URL: never make the
			// URL guessable from the period, date or member name.
			addRandomSuffix: true,
		},
	);
	await waitForBlob(blob.url);

	const pdfId = await repo.insertBillPdf(db, {
		billId,
		userId: member.id,
		blobUrl: blob.url,
		fileName,
		fileSize: pdf.length,
	});
	return { pdfId, downloadUrl: blob.url, fileName, wasExisting: false };
}
