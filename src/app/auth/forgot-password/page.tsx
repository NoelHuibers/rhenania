import type { Metadata } from "next";
import { ForgotPassword } from "~/components/auth/ForgotPassword";

export const metadata: Metadata = {
	title: "Passwort vergessen",
};

export default function Page() {
	return <ForgotPassword />;
}
