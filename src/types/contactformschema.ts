import { z } from "zod";

export const contactFormSchema = z.object({
	name: z.string().min(1, "Name ist erforderlich"),
	email: z.string().email("Ungültige E-Mail-Adresse"),
	message: z.string().min(1, "Nachricht ist erforderlich"),
	honeypot: z.string().optional(),
});

export type ContactFormType = z.output<typeof contactFormSchema>;
