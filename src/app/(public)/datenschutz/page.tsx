import type { Metadata } from "next";
import { Footer as FooterColored } from "~/components/footer/footercolored";
import { HeaderColored } from "~/components/header/headercolored";
import { getTenantProfile } from "~/server/lib/tenant-profile";
import Datenschutz from "./datenschutz";

export const metadata: Metadata = {
	title: "Datenschutzerklärung",
	robots: { index: false, follow: true },
};

export default async function HomePage() {
	const profile = await getTenantProfile();

	return (
		<div className="flex w-screen flex-col">
			<HeaderColored />
			<main className="flex h-full w-full items-center justify-center bg-slate-100 py-16 dark:bg-gray-800">
				<Datenschutz profile={profile} />
			</main>
			<FooterColored />
		</div>
	);
}
