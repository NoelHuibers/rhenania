"use server";
import nodemailer from "nodemailer";
import { env } from "~/env";

export async function sendEmail(name: string, email: string, message: string) {
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
		subject: "Email von Rhenania-stuttgart.de",
		text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
	};

	try {
		await transporter.sendMail(mailOptions);
	} catch (error) {
		throw new Error("Error beim Senden der Email");
	}
}
