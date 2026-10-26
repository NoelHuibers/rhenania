"use client";

import { useTheme } from "next-themes";
import type { ComponentProps } from "react";
import { Toaster as Sonner } from "sonner";

type ToasterProps = ComponentProps<typeof Sonner>;

/** Sonner toaster that follows the app theme. Mounted once by the root layout. */
function Toaster({ toastOptions, ...props }: ToasterProps) {
	const { resolvedTheme } = useTheme();
	return (
		<Sonner
			theme={resolvedTheme === "dark" ? "dark" : "light"}
			containerAriaLabel="Benachrichtigungen"
			toastOptions={{ closeButtonAriaLabel: "Schließen", ...toastOptions }}
			{...props}
		/>
	);
}

export { Toaster };
