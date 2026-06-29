"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight } from "lucide-react";
import type React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import {
	Form,
	FormControl,
	FormField,
	FormItem,
	FormLabel,
	FormMessage,
} from "~/components/ui/form";
import { Input } from "~/components/ui/input";
import { Textarea } from "~/components/ui/textarea";
import { onSubmitAction } from "~/lib/formSubmit";
import {
	type ContactFormType,
	contactFormSchema,
} from "~/types/contactformschema";

const fieldClass =
	"bg-white border-black/10 focus-visible:border-[#2f86d4] focus-visible:ring-[#2f86d4]/30";

const ContactForm = () => {
	const [formLoadTime, setFormLoadTime] = useState(0);

	const [state, formAction, pending] = useActionState(onSubmitAction, {
		message: "",
	});

	const form = useForm<ContactFormType>({
		resolver: zodResolver(contactFormSchema),
		defaultValues: {
			name: "",
			email: "",
			message: "",
			...(state?.fields ?? {}),
		},
	});

	const formRef = useRef<HTMLFormElement>(null);

	useEffect(() => {
		setFormLoadTime(Date.now());
	}, []);

	useEffect(() => {
		if (form === null) return;
		if (state?.message === "Success") {
			toast.success("E-Mail wurde versandt.", { duration: 5000 });
			form.reset();
			state.message = "";
		} else if (state?.message === "Falsche Eingabe") {
			toast.error("Eingabe ist ungültig. Bitte überprüfen Sie die Felder.");
		} else if (state?.message === "Falsche Eingabe Email") {
			toast.error("Eingabe ist ungültig. Bitte überprüfen Sie die Felder.");
		}
	}, [form, state]);

	const handleSubmit = (evt: React.FormEvent) => {
		evt.preventDefault();

		if (!formRef.current) return;
		const formData = new FormData(formRef.current);
		formData.append("formLoadTime", formLoadTime.toString());

		void form.handleSubmit(() => {
			formAction(formData);
		})(evt);
	};

	return (
		<Form {...form}>
			<form
				className="flex flex-col gap-5"
				action={formAction}
				ref={formRef}
				onSubmit={handleSubmit}
			>
				<FormField
					control={form.control}
					name="name"
					render={({ field }) => (
						<FormItem className="w-full">
							<FormLabel className="text-[#2c2630]">Name</FormLabel>
							<FormControl>
								<Input
									placeholder="Max Mustermann"
									className={fieldClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="email"
					render={({ field }) => (
						<FormItem className="w-full">
							<FormLabel className="text-[#2c2630]">E-Mail</FormLabel>
							<FormControl>
								<Input
									type="email"
									placeholder="max@beispiel.de"
									className={fieldClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="message"
					render={({ field }) => (
						<FormItem className="w-full">
							<FormLabel className="text-[#2c2630]">Deine Nachricht</FormLabel>
							<FormControl>
								<Textarea
									rows={6}
									placeholder="Erzähl uns ein wenig über Dich…"
									className={fieldClass}
									{...field}
								/>
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<FormField
					control={form.control}
					name="honeypot"
					render={({ field }) => (
						<FormItem className="hidden">
							<FormLabel>Honeypot</FormLabel>
							<FormControl>
								<Input type="text" {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>

				<button
					type="submit"
					disabled={pending}
					className="group relative mt-1 inline-flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-r from-[#d98aa6] to-[#2f86d4] px-8 py-3 font-semibold text-white shadow-[0_14px_40px_-12px_rgba(47,134,212,0.7)] transition-transform duration-300 hover:scale-[1.02] disabled:cursor-not-allowed disabled:opacity-60"
				>
					<span
						aria-hidden
						className="pointer-events-none absolute inset-y-0 -left-1/3 w-1/3 skew-x-[-20deg] bg-gradient-to-r from-transparent via-white/55 to-transparent transition-transform duration-700 ease-out group-hover:translate-x-[420%]"
					/>
					<span className="relative">{pending ? "Senden…" : "Senden"}</span>
					{!pending && (
						<ArrowRight className="relative h-5 w-5 transition-transform duration-300 group-hover:translate-x-1" />
					)}
				</button>
			</form>
		</Form>
	);
};

export default ContactForm;
