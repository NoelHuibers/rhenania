"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import type React from "react";
import { useActionState, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
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

const ContactForm = () => {
  const [formLoadTime, setFormLoadTime] = useState(0);

  const [state, formAction] = useActionState(onSubmitAction, {
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
    <section className="flex flex-col items-center justify-center space-y-2 md:w-3/4 dark:bg-gray-800">
      <h2 className="font-bold text-2xl md:text-4xl">Rhenania Stuttgart</h2>
      <p className="text-center text-gray-500 dark:text-gray-400">
        Bist Du bereit Stuttgarter Rhenane zu werden und ein Studium mit
        Persönlichkeit zu haben?
      </p>
      <p className="text-gray-500 dark:text-gray-400">
        Schreib uns eine E-Mail an und stelle Dich vor!
      </p>
      <Form {...form}>
        <form
          className="flex w-3/4 flex-col space-y-4 md:w-1/2"
          action={formAction}
          ref={formRef}
          onSubmit={handleSubmit}
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem className="w-full">
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                <FormLabel>E-Mail</FormLabel>
                <FormControl>
                  <Input {...field} />
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
                <FormLabel>Deine Nachricht</FormLabel>
                <FormControl>
                  <Textarea {...field} rows={6} />
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
          <Button type="submit" className="mt-4">
            Senden
          </Button>
        </form>
      </Form>
    </section>
  );
};

export default ContactForm;
