"use server";
import { contactFormSchema } from "~/types/contactformschema";
import { sendEmail } from "./sendEmail";

export type FormState = {
	message: string;
	fields?: Record<string, string>;
	issues?: string[];
};

export async function onSubmitAction(
	_prevState: FormState,
	data: FormData,
): Promise<FormState> {
	const formData = Object.fromEntries(data);
	const parsed = contactFormSchema.safeParse(formData);

	if (!parsed.success) {
		return { message: "Falsche Eingabe" };
	}

	if (parsed.data.honeypot !== undefined && parsed.data.honeypot !== "") {
		return { message: "Falsche Eingabe Email" };
	}

	const formLoadTime = Number(formData.formLoadTime);

	const currentTime = Date.now();

	if (currentTime - formLoadTime < 3000) {
		console.log("Suspicious fast form submission, ignoring.");
		return { message: "Success" };
	}

	const urlRegex = /(https?:\/\/[^\s]+)/g;
	if (urlRegex.test(parsed.data.message)) {
		console.log("Suspicious URL in message, ignoring.");
		return { message: "Success" };
	}

	await sendEmail(parsed.data.name, parsed.data.email, parsed.data.message);

	return { message: "Success" };
}
