import type { Metadata } from "next";
import { Suspense } from "react";
import { ResetPassword } from "~/components/auth/ResetPassword";

export const metadata: Metadata = {
	title: "Passwort zurücksetzen",
};

export default function Page() {
	return (
		<Suspense fallback={<div />}>
			<ResetPassword />
		</Suspense>
	);
}
