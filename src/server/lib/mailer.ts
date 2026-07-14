// mailer.ts — tenant-aware outbound email.
//
// Preferred transport is Microsoft Graph: each tenant's Azure app (the same
// registration used for Microsoft sign-in, stored in control
// `tenant_auth_config`) sends as the tenant's own mailbox via
// POST /users/{mailSenderEmail}/sendMail with a client-credentials token.
// Requirements per tenant: azureClientId/Secret/TenantId set, Mail.Send
// APPLICATION permission admin-consented, and `mailSenderEmail` configured.
//
// Tenants without Graph mail config fall back to the legacy shared Gmail
// transport (env GMAIL / GMAIL_PASSWORD) so nothing breaks during rollout.
// Once every tenant sends via Graph, the Gmail path (and its env vars) can
// be deleted.

import { eq } from "drizzle-orm";
import nodemailer from "nodemailer";

import { env } from "~/env";
import { controlDb } from "~/server/db/control";
import { tenantAuthConfig } from "~/server/db/control-schema";
import {
	getCurrentTenant,
	type TenantContext,
} from "~/server/lib/tenant-context";

export type TenantMailAttachment = {
	filename: string;
	content: Buffer;
	contentType: string;
};

export type TenantMail = {
	to: string;
	subject: string;
	text: string;
	html?: string;
	replyTo?: string;
	attachments?: TenantMailAttachment[];
};

type GraphMailConfig = {
	clientId: string;
	clientSecret: string;
	azureTenantId: string;
	senderEmail: string;
};

const CONFIG_CACHE_TTL_MS = 60_000;
const configCache = new Map<
	string,
	{ value: GraphMailConfig | null; expiresAt: number }
>();

async function getGraphMailConfig(
	tenantId: string,
): Promise<GraphMailConfig | null> {
	const cached = configCache.get(tenantId);
	if (cached && cached.expiresAt > Date.now()) return cached.value;

	const [row] = await controlDb
		.select({
			clientId: tenantAuthConfig.azureClientId,
			clientSecret: tenantAuthConfig.azureClientSecret,
			azureTenantId: tenantAuthConfig.azureTenantId,
			senderEmail: tenantAuthConfig.mailSenderEmail,
		})
		.from(tenantAuthConfig)
		.where(eq(tenantAuthConfig.tenantId, tenantId))
		.limit(1);

	const value =
		row?.clientId && row.clientSecret && row.azureTenantId && row.senderEmail
			? {
					clientId: row.clientId,
					clientSecret: row.clientSecret,
					azureTenantId: row.azureTenantId,
					senderEmail: row.senderEmail,
				}
			: null;
	configCache.set(tenantId, {
		value,
		expiresAt: Date.now() + CONFIG_CACHE_TTL_MS,
	});
	return value;
}

// App-only Graph tokens are valid ~1h; cache per Azure app until shortly
// before expiry.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getGraphToken(cfg: GraphMailConfig): Promise<string> {
	const key = `${cfg.azureTenantId}:${cfg.clientId}`;
	const cached = tokenCache.get(key);
	if (cached && cached.expiresAt > Date.now()) return cached.token;

	const res = await fetch(
		`https://login.microsoftonline.com/${cfg.azureTenantId}/oauth2/v2.0/token`,
		{
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				client_id: cfg.clientId,
				client_secret: cfg.clientSecret,
				scope: "https://graph.microsoft.com/.default",
				grant_type: "client_credentials",
			}),
		},
	);
	if (!res.ok) {
		throw new Error(
			`Graph token request failed (${res.status}): ${await res.text()}`,
		);
	}
	const data = (await res.json()) as {
		access_token: string;
		expires_in: number;
	};
	tokenCache.set(key, {
		token: data.access_token,
		expiresAt: Date.now() + (data.expires_in - 300) * 1000,
	});
	return data.access_token;
}

async function sendViaGraph(
	cfg: GraphMailConfig,
	tenant: TenantContext | null,
	mail: TenantMail,
): Promise<void> {
	const token = await getGraphToken(cfg);

	const message = {
		subject: mail.subject,
		body: mail.html
			? { contentType: "HTML", content: mail.html }
			: { contentType: "Text", content: mail.text },
		from: {
			emailAddress: {
				address: cfg.senderEmail,
				name: tenant?.displayName ?? cfg.senderEmail,
			},
		},
		toRecipients: [{ emailAddress: { address: mail.to } }],
		...(mail.replyTo
			? { replyTo: [{ emailAddress: { address: mail.replyTo } }] }
			: {}),
		...(mail.attachments?.length
			? {
					attachments: mail.attachments.map((a) => ({
						"@odata.type": "#microsoft.graph.fileAttachment",
						name: a.filename,
						contentType: a.contentType,
						contentBytes: a.content.toString("base64"),
					})),
				}
			: {}),
	};

	const res = await fetch(
		`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(cfg.senderEmail)}/sendMail`,
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${token}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ message, saveToSentItems: true }),
		},
	);
	if (!res.ok) {
		throw new Error(
			`Graph sendMail failed (${res.status}): ${await res.text()}`,
		);
	}
}

let gmailTransporter: nodemailer.Transporter | null = null;

function getGmailTransporter(): nodemailer.Transporter {
	if (!env.GMAIL || !env.GMAIL_PASSWORD) {
		throw new Error(
			"No mail transport available: tenant has no Graph mail config and GMAIL/GMAIL_PASSWORD are not set.",
		);
	}
	gmailTransporter ??= nodemailer.createTransport({
		service: "gmail",
		auth: { user: env.GMAIL, pass: env.GMAIL_PASSWORD },
	});
	return gmailTransporter;
}

async function sendViaGmail(
	tenant: TenantContext | null,
	mail: TenantMail,
): Promise<void> {
	const transporter = getGmailTransporter();
	await transporter.sendMail({
		from: tenant?.displayName
			? { name: tenant.displayName, address: env.GMAIL as string }
			: (env.GMAIL as string),
		to: mail.to,
		subject: mail.subject,
		text: mail.text,
		html: mail.html,
		replyTo: mail.replyTo,
		attachments: mail.attachments,
	});
}

/**
 * Send an email on behalf of the CURRENT tenant. Graph (tenant's own
 * mailbox) when configured, legacy Gmail otherwise.
 */
export async function sendTenantMail(mail: TenantMail): Promise<void> {
	const tenant = await getCurrentTenant();
	const graphCfg = tenant ? await getGraphMailConfig(tenant.id) : null;
	if (graphCfg) {
		await sendViaGraph(graphCfg, tenant, mail);
		return;
	}
	await sendViaGmail(tenant, mail);
}
