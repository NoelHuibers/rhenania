import { expect, test } from "vitest";
import { billStatusStyle, reimbursementStatusStyle } from "./status";

test.each([
	["Bezahlt", "success"],
	["Gestundet", "warning"],
	["Übertragen", "neutral"],
	["Unbezahlt", "danger"],
	[null, "danger"],
])("bill status %s is shown as %s", (status, tone) => {
	expect(billStatusStyle(status).tone).toBe(tone);
});

test.each([
	["Eingereicht", "warning"],
	["Genehmigt", "info"],
	["Ausgezahlt", "success"],
	["Abgelehnt", "danger"],
	["Unbekannt", "neutral"],
])("reimbursement status %s is shown as %s", (status, tone) => {
	expect(reimbursementStatusStyle(status).tone).toBe(tone);
});
