import { Mail, MapPin, Phone } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ContactForm } from "~/components/contact-form";
import { Footer } from "~/components/footer/footercolored";
import { HeaderColored } from "~/components/header/headercolored";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import {
	addressLine,
	phoneHref,
	tenantProfile,
} from "~/server/lib/tenant-profile";
import {
	RHENANIA_CONTACT_METADATA,
	RhenaniaContactPage,
} from "~/tenants/rhenania/contact-page";

export async function generateMetadata(): Promise<Metadata> {
	const tenant = await getCurrentTenant();
	if (tenant?.slug === "rhenania") {
		return RHENANIA_CONTACT_METADATA;
	}
	return { title: "Kontakt" };
}

// Contact page dispatcher: a Corps with its own page under
// `src/tenants/<slug>/` gets it; every other Corps a neutral page with the
// contact data from its branding.
export default async function ContactPage() {
	const tenant = await getCurrentTenant();
	const profile = tenantProfile(tenant);
	if (tenant?.slug === "rhenania") {
		return <RhenaniaContactPage displayName={profile.displayName} />;
	}

	const address = addressLine(profile);
	const contacts = [
		profile.contactEmail && {
			Icon: Mail,
			label: profile.contactEmail,
			href: `mailto:${profile.contactEmail}`,
		},
		profile.phone && {
			Icon: Phone,
			label: profile.phone,
			href: phoneHref(profile.phone),
		},
		address && {
			Icon: MapPin,
			label: address,
			href: `https://maps.google.com/?q=${encodeURIComponent(address)}`,
		},
	].filter((c) => Boolean(c)) as {
		Icon: typeof Mail;
		label: string;
		href: string;
	}[];

	return (
		<div className="flex min-h-screen w-full flex-col">
			<HeaderColored />
			<main className="flex grow items-center justify-center bg-slate-100 px-6 py-16">
				<div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
					<div>
						<h1 className="font-bold text-3xl tracking-tighter md:text-4xl">
							Kontakt zu {profile.displayName}
						</h1>
						<p className="mt-4 max-w-md text-gray-500">
							Schreib uns und stelle Dich vor — wir freuen uns, Dich
							kennenzulernen.
						</p>
						<div className="mt-8 flex flex-col gap-3">
							{contacts.map(({ Icon, label, href }) => (
								<Link
									key={label}
									href={href}
									className="inline-flex items-center gap-3 text-gray-700 hover:underline"
								>
									<Icon className="h-4 w-4" />
									<span className="text-sm">{label}</span>
								</Link>
							))}
						</div>
					</div>
					<div className="rounded-xl border bg-white p-6 shadow-sm md:p-8">
						<ContactForm />
					</div>
				</div>
			</main>
			<Footer />
		</div>
	);
}
