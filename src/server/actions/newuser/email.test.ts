import { beforeEach, describe, expect, test, vi } from "vitest";

import { sendTenantMail, type TenantMail } from "~/server/lib/mailer";
import { createKonto } from "../../../../test/factories/platform";
import { createTenant, setupTestDatabases } from "../../../../test/harness";
import { testState } from "../../../../test/state";
import {
	sendBeitragEmail,
	sendBillNotificationEmail,
	sendMahnungEmail,
	sendPasswordResetEmail,
	sendTreasurerBillEmail,
	sendVerificationEmail,
} from "./email";

vi.mock("~/server/lib/mailer", () => ({ sendTenantMail: vi.fn() }));

setupTestDatabases();

beforeEach(() => {
	vi.mocked(sendTenantMail).mockReset();
	vi.spyOn(console, "log").mockImplementation(() => {});
	vi.spyOn(console, "error").mockImplementation(() => {});
});

const pdf = Buffer.from("%PDF-1.4");

function sentMail(): TenantMail {
	const mail = vi.mocked(sendTenantMail).mock.lastCall?.[0];
	if (!mail) {
		throw new Error("No mail sent");
	}
	return mail;
}

describe("sendVerificationEmail", () => {
	test("links to the tenant host that issued the invitation", async () => {
		await createTenant({ slug: "hassia" });
		testState.headers = {
			host: "internal",
			"x-forwarded-host": "hassia.example",
			"x-forwarded-proto": "https",
		};

		await sendVerificationEmail("max+corps@example.test", "abc123");

		const mail = sentMail();
		const link =
			"https://hassia.example/auth/verify-email?token=abc123&email=max%2Bcorps%40example.test";
		expect(mail).toMatchObject({
			to: "max+corps@example.test",
			subject: "Bestätigen Sie Ihre E-Mail-Adresse",
		});
		expect(mail.text).toContain(link);
		expect(mail.text).toContain("nur 24 Stunden gültig");
		// In HTML attributes "&" is written as "&amp;"; mail clients decode it.
		expect(mail.html).toContain(`href="${link.replaceAll("&", "&amp;")}"`);
	});

	test("wraps transport failures in a generic error", async () => {
		await createTenant();
		vi.mocked(sendTenantMail).mockRejectedValueOnce(new Error("Graph 401"));

		await expect(sendVerificationEmail("a@example.test", "t")).rejects.toThrow(
			"Failed to send verification email",
		);
	});
});

describe("bill mails", () => {
	test("member bill: German amount, tenant signature and the PDF attached", async () => {
		await createTenant({ displayName: "Corps Hassia" });

		await sendBillNotificationEmail(
			"max@example.test",
			"Max",
			"KW-43-26",
			1234.5,
			pdf,
			"Rechnung-KW-43-26.pdf",
			21,
		);

		const mail = sentMail();
		expect(mail.to).toBe("max@example.test");
		expect(mail.subject).toBe("Deine Getränkerechnung KW-43-26 ist bereit");
		expect(mail.text).toContain("Hallo Max,");
		expect(mail.text).toContain("Gesamtbetrag: 1234,50€");
		expect(mail.text).toMatch(/Mit freundlichen Grüßen,\s+Corps Hassia/);
		expect(mail.html).toContain("1234,50€");
		expect(mail.html).toContain("Corps Hassia");
		// The Zahlungsziel of the Kasse, as printed on the PDF (#184).
		expect(mail.text).toContain(
			"Bitte überweise den Betrag innerhalb von 21 Tagen.",
		);
		expect(mail.html).toContain("innerhalb von <strong>21 Tagen</strong>");
		expect(mail.attachments).toEqual([
			{
				filename: "Rechnung-KW-43-26.pdf",
				content: pdf,
				contentType: "application/pdf",
			},
		]);
	});

	test("user-controlled names are escaped in the HTML, not in the text", async () => {
		await createTenant({ displayName: "Corps <b>Test</b>" });
		const name = '<a href="https://evil.example">Max</a>';

		await sendBillNotificationEmail(
			"max@example.test",
			name,
			"KW-43-26",
			5,
			pdf,
			"r.pdf",
			14,
		);

		const mail = sentMail();
		expect(mail.html).not.toContain('<a href="https://evil.example">');
		expect(mail.html).toContain(
			"&lt;a href=&quot;https://evil.example&quot;&gt;Max&lt;/a&gt;",
		);
		expect(mail.html).toContain("Corps &lt;b&gt;Test&lt;/b&gt;");
		expect(mail.text).toContain(`Hallo ${name},`);
	});

	test("treasurer copy names whose bill it is", async () => {
		await createTenant({ displayName: "Corps Hassia" });

		await sendTreasurerBillEmail(
			"kasse@hassia.example",
			"Max Muster",
			"KW-43-26",
			7,
			pdf,
			"r.pdf",
		);

		const mail = sentMail();
		expect(mail.to).toBe("kasse@hassia.example");
		expect(mail.subject).toBe("Getränkerechnung KW-43-26: Max Muster");
		expect(mail.text).toContain("Rechnung für: Max Muster");
		expect(mail.text).toContain("Gesamtbetrag: 7,00€");
		expect(mail.text).toContain("Corps Hassia");
		expect(mail.attachments?.[0]?.filename).toBe("r.pdf");
	});

	test("a credit reads as Guthaben, not as an amount to pay (#220)", async () => {
		await createTenant({ displayName: "Corps Hassia" });

		await sendBillNotificationEmail(
			"lena@example.test",
			"Lena",
			"KW-43-26",
			-1,
			pdf,
			"r.pdf",
			21,
		);
		const member = sentMail();
		await sendTreasurerBillEmail(
			"kasse@hassia.example",
			"Lena",
			"KW-43-26",
			-1,
			pdf,
			"r.pdf",
		);
		const treasurer = sentMail();

		expect(member.text).toContain("Guthaben: 1,00€");
		expect(member.text).toContain(
			"Du musst nichts überweisen. Dein Guthaben wird mit deiner nächsten Rechnung verrechnet.",
		);
		expect(member.html).toContain(">Guthaben</p>");
		expect(member.html).toContain(">1,00€</div>");
		for (const mail of [member, treasurer]) {
			expect(mail.text).not.toContain("Gesamtbetrag");
			expect(mail.text).not.toContain("überweise den Betrag");
			expect(mail.text).not.toContain("-1,00");
			expect(mail.html).not.toContain("überweise den Betrag");
		}
		expect(treasurer.text).toContain("Guthaben: 1,00€");
		expect(treasurer.html).toContain(">Guthaben</p>");
	});

	test("signs with a neutral label outside a tenant request", async () => {
		await sendBillNotificationEmail(
			"a@example.test",
			"A",
			"KW-1",
			1,
			pdf,
			"r.pdf",
			14,
		);
		expect(sentMail().text).toMatch(/Grüßen,\s+Corps\s*$/);
	});

	test("names the recipient when sending fails", async () => {
		await createTenant();
		vi.mocked(sendTenantMail).mockRejectedValue(new Error("down"));

		await expect(
			sendBillNotificationEmail(
				"a@example.test",
				"A",
				"KW-1",
				1,
				pdf,
				"r.pdf",
				14,
			),
		).rejects.toThrow(
			"Failed to send bill notification email to a@example.test",
		);
		await expect(
			sendTreasurerBillEmail("k@example.test", "A", "KW-1", 1, pdf, "r.pdf"),
		).rejects.toThrow("Failed to send treasurer bill email to k@example.test");
		await expect(
			sendBeitragEmail("b@example.test", "B", "WS 26", 1, pdf, "b.pdf"),
		).rejects.toThrow("Failed to send Beitrag email to b@example.test");
		await expect(
			sendMahnungEmail("m@example.test", "M", "WS 26", 1, pdf, "m.pdf"),
		).rejects.toThrow("Failed to send Mahnung email to m@example.test");
		await expect(
			sendPasswordResetEmail("p@example.test", "https://x"),
		).rejects.toThrow("Failed to send password reset email");
	});
});

describe("Semesterbeitrag mails", () => {
	test("Beitrag mail links the active CC-Kasse PayPal", async () => {
		await createTenant({ displayName: "Corps Hassia" });
		await createKonto({
			kasseType: "CC-Kasse",
			paypalLink: "@HassiaCC",
		});
		await createKonto({
			kasseType: "CC-Kasse",
			paypalLink: "paypal.me/Inactive",
			isActive: false,
		});

		await sendBeitragEmail(
			"max@example.test",
			"Max",
			"WS 2026/27",
			80,
			pdf,
			"b.pdf",
		);

		const mail = sentMail();
		expect(mail.subject).toBe("Dein Semesterbeitrag — WS 2026/27");
		expect(mail.text).toContain(
			"für WS 2026/27 bitten wir um deinen Semesterbeitrag in Höhe von 80,00€",
		);
		expect(mail.text).toContain(
			"Oder bezahle bequem per PayPal: https://paypal.me/HassiaCC",
		);
		expect(mail.text).toMatch(/Grüßen\nCorps Hassia$/);
		expect(mail.html).toContain('<a href="https://paypal.me/HassiaCC">');
		expect(mail.html).toContain("<h1>Corps Hassia</h1>");
		expect(mail.attachments?.[0]?.filename).toBe("b.pdf");
	});

	test("Mahnung mail without a PayPal konto has no PayPal line", async () => {
		await createTenant({ displayName: "Corps Hassia" });
		await createKonto({ kasseType: "Getränkekasse", paypalLink: "@Bier" });

		await sendMahnungEmail(
			"max@example.test",
			"Max",
			"WS 2026/27",
			95.5,
			pdf,
			"m.pdf",
		);

		const mail = sentMail();
		expect(mail.subject).toBe("Zahlungserinnerung — WS 2026/27");
		expect(mail.text).toContain(
			"Inklusive Mahngebühr beträgt der offene Gesamtbetrag 95,50€",
		);
		expect(mail.text).not.toContain("PayPal");
		expect(mail.html).not.toContain("paypal.me");
	});
});

test("password reset mail carries the reset link", async () => {
	await createTenant();

	await sendPasswordResetEmail(
		"max@example.test",
		"https://hassia.example/auth/reset?token=xyz",
	);

	const mail = sentMail();
	expect(mail.subject).toBe("Passwort zurücksetzen");
	expect(mail.text).toContain("https://hassia.example/auth/reset?token=xyz");
	expect(mail.text).toContain("nur 1 Stunde gültig");
});

// Every HTML mail, with markup in every value a user or admin can set:
// display names, bill numbers, Beitrag run names, the tenant name and the
// PayPal link. None of it may reach the HTML unescaped (#91).
test("no HTML mail interpolates user values unescaped (#91)", async () => {
	const evil = `<i>x</i>"'`;
	await createTenant({ displayName: `Corps ${evil}` });
	await createKonto({
		kasseType: "CC-Kasse",
		paypalLink: `https://paypal.me/a"><img src=x>`,
	});

	const sends: Array<() => Promise<unknown>> = [
		() => sendVerificationEmail("a@example.test", `t${evil}`),
		() => sendPasswordResetEmail("a@example.test", `https://x/r?t=${evil}`),
		() =>
			sendBillNotificationEmail("a@example.test", evil, evil, 1, pdf, "r", 14),
		() => sendTreasurerBillEmail("k@example.test", evil, evil, 1, pdf, "r"),
		() => sendBeitragEmail("a@example.test", evil, evil, 1, pdf, "b"),
		() => sendMahnungEmail("a@example.test", evil, evil, 1, pdf, "m"),
	];
	for (const send of sends) {
		vi.mocked(sendTenantMail).mockClear();
		await send();
		const html = sentMail().html ?? "";
		expect(html).not.toMatch(/<i>|<img|"'/);
		expect(html).toContain("&lt;");
	}
});
