"use server";
import nodemailer from "nodemailer";
import { env } from "~/env";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export async function sendEmail(name: string, email: string, message: string) {
	const tenant = await getCurrentTenant();
	const tenantLabel = tenant?.displayName ?? "Corps";

	const transporter = nodemailer.createTransport({
		service: "gmail",
		auth: {
			user: env.GMAIL,
			pass: env.GMAIL_PASSWORD,
		},
	});

	const mailOptions = {
		from: env.GMAIL,
		to: env.TOMAIL,
		subject: `Email von ${tenantLabel}`,
		text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
	};

	try {
		await transporter.sendMail(mailOptions);
	} catch (_error) {
		throw new Error("Error beim Senden der Email");
	}
}
