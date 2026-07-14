"use server";
import { env } from "~/env";
import { sendTenantMail } from "~/server/lib/mailer";
import { getCurrentTenant } from "~/server/lib/tenant-context";

// Public contact form: delivered to the tenant's contact address
// (branding.contactEmail), falling back to the legacy TOMAIL env.
export async function sendEmail(name: string, email: string, message: string) {
	const tenant = await getCurrentTenant();
	const tenantLabel = tenant?.displayName ?? "Corps";
	const to = tenant?.branding?.contactEmail ?? env.TOMAIL;
	if (!to) {
		throw new Error(
			"No contact recipient configured (branding.contactEmail / TOMAIL).",
		);
	}

	try {
		await sendTenantMail({
			to,
			subject: `Kontaktanfrage über ${tenantLabel}`,
			text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
			replyTo: email,
		});
	} catch (_error) {
		throw new Error("Error beim Senden der Email");
	}
}
