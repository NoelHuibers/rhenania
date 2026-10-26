import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { tenants } from "~/server/db/control-schema";
import { sendTenantMail } from "~/server/lib/mailer";
import {
	controlDb,
	createTenant,
	setupTestDatabases,
} from "../../test/harness";
import { onSubmitAction } from "./formSubmit";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

const NOW = new Date("2026-10-26T12:00:00Z").getTime();

beforeEach(() => {
	vi.useFakeTimers({ toFake: ["Date"] });
	vi.setSystemTime(NOW);
	vi.mocked(sendTenantMail).mockReset();
	vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
	vi.useRealTimers();
});

async function tenantWithContact() {
	const tenant = await createTenant({ displayName: "Corps Hassia" });
	await controlDb()
		.update(tenants)
		.set({ branding: { contactEmail: "kontakt@hassia.example" } })
		.where(eq(tenants.id, tenant.id));
	return tenant;
}

function contactForm(values: Record<string, string> = {}) {
	const data = new FormData();
	const all = {
		name: "Erika Muster",
		email: "erika@example.test",
		message: "Wann ist die nächste Kneipe?",
		formLoadTime: String(NOW - 10_000),
		...values,
	};
	for (const [k, v] of Object.entries(all)) data.set(k, v);
	return data;
}

describe("contact form", () => {
	test("delivers to the tenant's contact address with reply-to", async () => {
		await tenantWithContact();

		expect(await onSubmitAction({ message: "" }, contactForm())).toEqual({
			message: "Success",
		});
		expect(sendTenantMail).toHaveBeenCalledWith({
			to: "kontakt@hassia.example",
			subject: "Kontaktanfrage über Corps Hassia",
			text: "Name: Erika Muster\nEmail: erika@example.test\nMessage: Wann ist die nächste Kneipe?",
			replyTo: "erika@example.test",
		});
	});

	test("rejects invalid input and a filled honeypot", async () => {
		await tenantWithContact();

		expect(
			await onSubmitAction({ message: "" }, contactForm({ email: "nope" })),
		).toEqual({ message: "Falsche Eingabe" });
		expect(
			await onSubmitAction({ message: "" }, contactForm({ name: "" })),
		).toEqual({ message: "Falsche Eingabe" });
		expect(
			await onSubmitAction({ message: "" }, contactForm({ honeypot: "bot" })),
		).toEqual({ message: "Falsche Eingabe Email" });
		expect(sendTenantMail).not.toHaveBeenCalled();
	});

	test("silently drops bot-like submissions", async () => {
		await tenantWithContact();

		expect(
			await onSubmitAction(
				{ message: "" },
				contactForm({ formLoadTime: String(NOW - 2_000) }),
			),
		).toEqual({ message: "Success" });
		expect(
			await onSubmitAction(
				{ message: "" },
				contactForm({ message: "Billig: https://spam.example" }),
			),
		).toEqual({ message: "Success" });
		expect(sendTenantMail).not.toHaveBeenCalled();
	});

	test("fails without a configured recipient", async () => {
		await createTenant();

		await expect(
			onSubmitAction({ message: "" }, contactForm()),
		).rejects.toThrow(
			"No contact recipient configured (branding.contactEmail / TOMAIL).",
		);
	});

	test("hides transport errors behind a generic message", async () => {
		await tenantWithContact();
		vi.mocked(sendTenantMail).mockRejectedValueOnce(new Error("Graph 403"));

		await expect(
			onSubmitAction({ message: "" }, contactForm()),
		).rejects.toThrow("Error beim Senden der Email");
	});
});
