import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";

import { createTenant, setupTestDatabases } from "../../../test/harness";

setupTestDatabases();

let outbox: string | null = null;

afterEach(() => {
	vi.unstubAllEnvs();
	vi.resetModules();
	if (outbox) {
		rmSync(outbox, { recursive: true, force: true });
	}
	outbox = null;
});

async function loadMailer(env: Record<string, string>) {
	for (const [key, value] of Object.entries(env)) {
		vi.stubEnv(key, value);
	}
	vi.resetModules();
	return import("./mailer");
}

describe("sendTenantMail outbox", () => {
	test("writes mail as JSON instead of sending when MAIL_OUTBOX_DIR is set", async () => {
		outbox = mkdtempSync(path.join(os.tmpdir(), "rhenania-outbox-"));
		const { sendTenantMail } = await loadMailer({ MAIL_OUTBOX_DIR: outbox });
		await createTenant({ slug: "hassia" });

		await sendTenantMail({
			to: "member@example.test",
			subject: "Deine Getränkerechnung",
			text: "Hallo",
			attachments: [
				{
					filename: "r.pdf",
					contentType: "application/pdf",
					content: Buffer.from("pdf"),
				},
			],
		});

		const files = readdirSync(outbox);
		expect(files).toHaveLength(1);
		const mail = JSON.parse(
			readFileSync(path.join(outbox, files[0] as string), "utf8"),
		);
		expect(mail).toMatchObject({
			tenant: "hassia",
			to: "member@example.test",
			subject: "Deine Getränkerechnung",
			attachments: [
				{ filename: "r.pdf", contentType: "application/pdf", size: 3 },
			],
		});
	});

	test("refuses to use the outbox on Vercel production", async () => {
		outbox = mkdtempSync(path.join(os.tmpdir(), "rhenania-outbox-"));
		const { sendTenantMail } = await loadMailer({
			MAIL_OUTBOX_DIR: outbox,
			VERCEL_ENV: "production",
		});
		await createTenant();

		await expect(
			sendTenantMail({ to: "a@example.test", subject: "x", text: "x" }),
		).rejects.toThrow(/production/);
		expect(readdirSync(outbox)).toHaveLength(0);
	});

	test("without outbox or Gmail credentials it fails instead of sending", async () => {
		const { sendTenantMail } = await loadMailer({});
		await createTenant();

		await expect(
			sendTenantMail({ to: "a@example.test", subject: "x", text: "x" }),
		).rejects.toThrow(/No mail transport/);
	});

	test("falls back to Gmail via nodemailer with the tenant as sender name", async () => {
		const sendMail = vi.fn().mockResolvedValue({});
		vi.doMock("nodemailer", () => ({
			createTransport: vi.fn(() => ({ sendMail })),
		}));
		const { sendTenantMail } = await loadMailer({
			GMAIL: "kasse@example.test",
			GMAIL_PASSWORD: "app-password",
		});
		await createTenant({ displayName: "Corps Test" });

		await sendTenantMail({
			to: "a@example.test",
			subject: "Rechnung",
			text: "Hallo",
		});

		expect(sendMail).toHaveBeenCalledWith(
			expect.objectContaining({
				from: { name: "Corps Test", address: "kasse@example.test" },
				to: "a@example.test",
				subject: "Rechnung",
				text: "Hallo",
			}),
		);
		vi.doUnmock("nodemailer");
	});
});

test("nodemailer accepts the message shape the mailer sends (offline JSON transport)", async () => {
	const { createTransport } =
		await vi.importActual<typeof import("nodemailer")>("nodemailer");
	const transport = createTransport({ jsonTransport: true });
	const info = await transport.sendMail({
		from: { name: "Corps Test", address: "kasse@example.test" },
		to: "a@example.test",
		subject: "Getränkerechnung",
		text: "Hallo",
		html: "<p>Hallo</p>",
		replyTo: "reply@example.test",
		attachments: [
			{
				filename: "r.pdf",
				content: Buffer.from("pdf"),
				contentType: "application/pdf",
			},
		],
	});
	const message = JSON.parse(String(info.message));
	expect(message).toMatchObject({
		subject: "Getränkerechnung",
		from: { address: "kasse@example.test", name: "Corps Test" },
	});
	expect(message.attachments).toHaveLength(1);
});
