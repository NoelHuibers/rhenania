import { Mail, MapPin, Phone } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { Toaster } from "sonner";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import { SiteFooter } from "~/tenants/rhenania/sections/site-footer";
import { SiteHeader } from "~/tenants/rhenania/sections/site-header";
import ContactForm from "./contactform";

const CONTACTS = [
	{
		Icon: Mail,
		label: "corps@rhenania-stuttgart.de",
		href: "mailto:corps@rhenania-stuttgart.de",
	},
	{ Icon: Phone, label: "+49 711 297308", href: "tel:+49711297308" },
	{
		Icon: MapPin,
		label: "Relenbergstraße 8, 70174 Stuttgart",
		href: "https://maps.google.com/?q=Relenbergstraße+8+70174+Stuttgart",
	},
] as const;

export default async function ContactPage() {
	const tenant = await getCurrentTenant();
	const displayName = tenant?.displayName ?? "Corps Rhenania";

	return (
		<div className="relative flex min-h-screen flex-col bg-[#faf6f4] text-[#2c2630]">
			<SiteHeader displayName={displayName} />

			<main className="relative grow overflow-hidden px-6 pt-28 pb-20 md:pt-36">
				{/* Couleur aurora */}
				<div
					aria-hidden
					className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
				>
					<div
						className="absolute top-[-12%] left-[-6%] h-[40rem] w-[40rem] rounded-full opacity-50 blur-3xl"
						style={{
							background:
								"radial-gradient(circle at 50% 50%, #d98aa6 0%, rgba(217,138,166,0) 68%)",
						}}
					/>
					<div
						className="absolute right-[-8%] bottom-[-18%] h-[42rem] w-[42rem] rounded-full opacity-50 blur-3xl"
						style={{
							background:
								"radial-gradient(circle at 50% 50%, #2f86d4 0%, rgba(47,134,212,0) 68%)",
						}}
					/>
				</div>

				{/* Faint Zirkel watermark */}
				<Image
					src="/zirkel.svg"
					alt=""
					aria-hidden
					width={520}
					height={520}
					className="pointer-events-none absolute top-1/2 right-[-6rem] -z-10 h-auto w-[34rem] max-w-[60vw] -translate-y-1/2 opacity-[0.04]"
				/>

				<div className="mx-auto grid max-w-6xl grid-cols-1 gap-12 lg:grid-cols-2 lg:items-center">
					{/* Intro */}
					<div>
						<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.45em]">
							Kontakt
						</p>
						<h1 className="mt-4 font-heading font-semibold text-4xl leading-[1.05] tracking-tight sm:text-6xl">
							Werde{" "}
							<span className="bg-gradient-to-r from-[#b85d7c] via-[#d98aa6] to-[#2f86d4] bg-clip-text text-transparent">
								Stuttgarter Rhenane
							</span>
						</h1>
						<p className="mt-6 max-w-md text-[#6f6675] text-lg leading-relaxed">
							Bist Du bereit, Stuttgarter Rhenane zu werden und ein Studium mit
							Persönlichkeit zu haben? Schreib uns und stelle Dich vor — wir
							freuen uns, Dich kennenzulernen.
						</p>

						<div className="mt-8 flex flex-col gap-3">
							{CONTACTS.map(({ Icon, label, href }) => (
								<Link
									key={label}
									href={href}
									className="group inline-flex items-center gap-3 text-[#2c2630]/80 transition-colors hover:text-[#b85d7c]"
								>
									<span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white shadow-[0_2px_12px_-6px_rgba(44,38,48,0.35)] ring-1 ring-black/5 transition-colors group-hover:text-[#2f86d4]">
										<Icon className="h-4 w-4" />
									</span>
									<span className="text-sm">{label}</span>
								</Link>
							))}
						</div>
					</div>

					{/* Form card */}
					<div className="rounded-3xl border border-black/5 bg-white/80 p-6 shadow-[0_24px_60px_-28px_rgba(44,38,48,0.4)] backdrop-blur-sm md:p-8">
						<ContactForm />
					</div>
				</div>
			</main>

			<SiteFooter />
			<Toaster richColors position="top-center" />
		</div>
	);
}
