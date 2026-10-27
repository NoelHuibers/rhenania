import {
	ArrowRight,
	BookOpen,
	Handshake,
	History,
	Network,
	ShieldCheck,
	Users,
} from "lucide-react";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAllActiveImagesBySection } from "~/server/actions/bilder/images";
import { getCurrentTenant } from "~/server/lib/tenant-context";
import { SiteFooter } from "~/tenants/rhenania/sections/site-footer";
import { SiteHeader } from "~/tenants/rhenania/sections/site-header";
import {
	createBreadcrumbJsonLd,
	createFaqJsonLd,
	createRhenaniaMetadata,
	type FaqItem,
	JsonLd,
} from "~/tenants/rhenania/seo";

const DEFAULT_HERO_IMAGE = "/0.webp";
const FALLBACK_IMAGES = [DEFAULT_HERO_IMAGE, "/1.webp", "/2.webp", "/3.webp"];

const FAQS: readonly FaqItem[] = [
	{
		question: "Was ist ein Corps?",
		answer:
			"Ein Corps ist eine traditionsreiche Form der Studentenverbindung. Das Corps Rhenania verbindet Studenten und Alumni in einer toleranten, liberalen, unpolitischen und nicht konfessionellen Gemeinschaft.",
	},
	{
		question: "Wie kann ich die Studentenverbindung kennenlernen?",
		answer:
			"Schreib uns über das Kontaktformular oder komm nach Absprache bei einer Veranstaltung vorbei. Das erste Kennenlernen ist unverbindlich und bietet Raum für alle deine Fragen.",
	},
	{
		question: "Wie werde ich Mitglied im Corps Rhenania?",
		answer:
			"Am Anfang steht das persönliche Kennenlernen. Du erlebst unsere Gemeinschaft und wir sprechen offen über Erwartungen, Werte und den Weg zur Mitgliedschaft, bevor beide Seiten entscheiden.",
	},
	{
		question: "Ist das Corps politisch oder konfessionell gebunden?",
		answer:
			"Nein. Rhenania ist unpolitisch und nicht konfessionell. Unterschiedliche Standpunkte gehören zu unserem Toleranzprinzip.",
	},
	{
		question: "Was bedeutet Altherrenschaft?",
		answer:
			"Die Alumni des Corps werden traditionell Alte Herren genannt. Sie bleiben Teil der Gemeinschaft und bilden gemeinsam mit den aktiven Studenten ein generationsübergreifendes Netzwerk.",
	},
];

export const metadata: Metadata = createRhenaniaMetadata({
	title: "Studentenverbindung Stuttgart | Corps Rhenania",
	description:
		"Lerne das Corps Rhenania Stuttgart kennen: tolerante Gemeinschaft, Verantwortung und ein studentisches Netzwerk mit Tradition seit 1859.",
	path: "/studentenverbindung-stuttgart",
});

const breadcrumbJsonLd = createBreadcrumbJsonLd([
	{ name: "Corps Rhenania Stuttgart", path: "/" },
	{
		name: "Studentenverbindung Stuttgart",
		path: "/studentenverbindung-stuttgart",
	},
]);

export default async function StudentenverbindungStuttgartPage() {
	const tenant = await getCurrentTenant();
	if (tenant?.slug !== "rhenania") {
		notFound();
	}

	const storedImages = await getAllActiveImagesBySection("aktive");
	const images =
		storedImages.length > 0
			? storedImages.map((image) => image.imageUrl)
			: FALLBACK_IMAGES;
	const heroImage = images[0] ?? DEFAULT_HERO_IMAGE;

	return (
		<div className="relative min-h-screen bg-[#faf6f4] text-[#2c2630]">
			<JsonLd id="studentenverbindung-breadcrumbs" data={breadcrumbJsonLd} />
			<JsonLd id="studentenverbindung-faq" data={createFaqJsonLd(FAQS)} />
			<SiteHeader displayName={tenant.displayName} />

			<main>
				<section className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-40 md:pb-28">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 -z-10"
					>
						<div className="absolute -top-44 -right-36 h-[36rem] w-[36rem] rounded-full bg-[#2f86d4]/16 blur-3xl" />
						<div className="absolute -bottom-48 -left-40 h-[38rem] w-[38rem] rounded-full bg-[#d98aa6]/20 blur-3xl" />
					</div>

					<div className="mx-auto max-w-6xl">
						<nav aria-label="Brotkrumen" className="text-[#6f6675] text-sm">
							<Link className="hover:text-[#b85d7c]" href="/">
								Startseite
							</Link>
							<span aria-hidden className="mx-2">
								/
							</span>
							<span>Studentenverbindung Stuttgart</span>
						</nav>

						<div className="mt-10 grid min-w-0 items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
							<div className="min-w-0">
								<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
									Corps · Stuttgart · seit 1859
								</p>
								<h1 className="mt-5 max-w-3xl hyphens-auto break-words font-heading font-semibold text-4xl leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
									Studentenverbindung in Stuttgart kennenlernen
								</h1>
								<p className="mt-7 max-w-2xl text-[#6f6675] text-lg leading-relaxed sm:text-xl">
									Rhenania ist eine tolerante Gemeinschaft von Studenten und
									Alumni. Wir verbinden Freundschaft, akademischen Erfolg,
									Eigenverantwortung und ein Netzwerk, das über das Studium
									hinausreicht.
								</p>
								<div className="mt-9 flex flex-wrap gap-4">
									<Link
										href="/contact"
										className="group inline-flex items-center gap-2 rounded-full bg-[#2c2630] px-7 py-3.5 font-medium text-[#faf6f4] transition-colors hover:bg-[#b85d7c]"
									>
										Unverbindlich kennenlernen
										<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
									</Link>
									<a
										href="#warum-corps"
										className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-7 py-3.5 font-medium transition-colors hover:border-[#b85d7c]/40 hover:text-[#b85d7c]"
									>
										Warum Rhenania?
									</a>
								</div>
							</div>

							<div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_28px_80px_-36px_rgba(44,38,48,0.55)]">
								<Image
									src={heroImage}
									alt="Studentische Gemeinschaft des Corps Rhenania Stuttgart"
									fill
									priority
									sizes="(max-width: 1024px) 100vw, 50vw"
									className="object-cover"
									unoptimized={heroImage.endsWith(".gif")}
								/>
							</div>
						</div>
					</div>
				</section>

				<section
					id="warum-corps"
					className="border-black/5 border-y bg-white/60 px-6 py-20 md:py-28"
				>
					<div className="mx-auto max-w-6xl">
						<div className="mx-auto max-w-3xl text-center">
							<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
								Gemeinschaft im Studium
							</p>
							<h2 className="mt-4 font-heading font-semibold text-4xl tracking-tight sm:text-6xl">
								Warum einem Corps beitreten?
							</h2>
							<p className="mt-6 text-[#6f6675] text-lg leading-relaxed">
								Ein Corps ist mehr als ein Termin im Kalender. Du gestaltest
								eine Gemeinschaft mit, übernimmst Verantwortung und findest
								persönliche Ansprechpartner in unterschiedlichen Studien- und
								Lebensphasen.
							</p>
						</div>

						<div className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
							{[
								{
									Icon: Users,
									title: "Freundschaft & Gemeinschaft",
									text: "Gemeinsam lernen, kochen, Sport treiben, reisen und Veranstaltungen erleben.",
								},
								{
									Icon: BookOpen,
									title: "Erfolgreich studieren",
									text: "Eine Gemeinschaft mit klarem Fokus auf akademischen Erfolg und gegenseitige Unterstützung.",
								},
								{
									Icon: Handshake,
									title: "Verantwortung übernehmen",
									text: "Organisieren, entscheiden und dich engagieren – mit echtem Gestaltungsspielraum im Corpsleben.",
								},
								{
									Icon: Network,
									title: "Generationen verbinden",
									text: "Aktive Studenten und Alumni bilden eine persönliche, langfristige Gemeinschaft.",
								},
							].map(({ Icon, title, text }) => (
								<article
									key={title}
									className="rounded-2xl border border-black/5 bg-white p-7"
								>
									<Icon className="h-6 w-6 text-[#b85d7c]" aria-hidden />
									<h3 className="mt-5 font-heading font-semibold text-2xl">
										{title}
									</h3>
									<p className="mt-3 text-[#6f6675] leading-relaxed">{text}</p>
								</article>
							))}
						</div>
					</div>
				</section>

				<section className="px-6 py-20 md:py-28">
					<div className="mx-auto grid min-w-0 max-w-6xl items-center gap-12 lg:grid-cols-2">
						<div className="grid grid-cols-2 gap-4">
							{images.slice(1, 4).map((src, index) => (
								<div
									key={src}
									className={`relative overflow-hidden rounded-2xl border border-black/5 bg-white ${
										index === 0 ? "col-span-2 aspect-[2/1]" : "aspect-square"
									}`}
								>
									<Image
										src={src}
										alt={`Corpsleben bei Rhenania Stuttgart ${index + 1}`}
										fill
										sizes="(max-width: 1024px) 50vw, 25vw"
										className="object-cover"
										unoptimized={src.endsWith(".gif")}
									/>
								</div>
							))}
						</div>

						<div className="min-w-0">
							<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
								Tradition mit Haltung
							</p>
							<h2 className="mt-4 hyphens-auto break-words font-heading font-semibold text-4xl tracking-tight sm:text-6xl">
								Eine tolerante Studentenverbindung seit 1859
							</h2>
							<p className="mt-6 text-[#6f6675] text-lg leading-relaxed">
								Rhenania ist liberal, unpolitisch und nicht konfessionell. Unser
								Zusammenleben baut auf Toleranz: Unterschiedliche Meinungen und
								Lebenswege gehören zu einer starken Gemeinschaft.
							</p>
							<div className="mt-8 grid gap-4 sm:grid-cols-2">
								<div className="rounded-2xl border border-black/5 bg-white p-6">
									<History className="h-6 w-6 text-[#b85d7c]" aria-hidden />
									<p className="mt-4 font-heading font-semibold text-xl">
										Seit 1859 in Stuttgart
									</p>
								</div>
								<div className="rounded-2xl border border-black/5 bg-white p-6">
									<ShieldCheck className="h-6 w-6 text-[#2f86d4]" aria-hidden />
									<p className="mt-4 font-heading font-semibold text-xl">
										Unpolitisch & nicht konfessionell
									</p>
								</div>
							</div>
						</div>
					</div>
				</section>

				<section className="border-black/5 border-y bg-[#f3ebee] px-6 py-20 md:py-28">
					<div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.72fr_1.28fr]">
						<div>
							<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
								Corps kennenlernen
							</p>
							<h2 className="mt-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
								Häufige Fragen zur Mitgliedschaft
							</h2>
						</div>
						<div className="space-y-4">
							{FAQS.map((faq) => (
								<details
									key={faq.question}
									className="group rounded-2xl border border-black/5 bg-white p-6"
								>
									<summary className="cursor-pointer list-none font-heading font-semibold text-xl marker:hidden">
										{faq.question}
									</summary>
									<p className="mt-4 text-[#6f6675] leading-relaxed">
										{faq.answer}
									</p>
								</details>
							))}
						</div>
					</div>
				</section>

				<section className="px-6 py-24 text-center md:py-32">
					<h2 className="mx-auto max-w-3xl font-heading font-semibold text-4xl tracking-tight sm:text-6xl">
						Lerne das Corps Rhenania unverbindlich kennen
					</h2>
					<p className="mx-auto mt-6 max-w-2xl text-[#6f6675] text-lg leading-relaxed">
						Du musst dich nicht sofort entscheiden. Schreib uns, stell deine
						Fragen und lerne unsere Gemeinschaft persönlich kennen.
					</p>
					<div className="mt-9 flex flex-wrap justify-center gap-4">
						<Link
							href="/contact"
							className="group inline-flex items-center gap-2 rounded-full bg-[#2c2630] px-8 py-4 font-medium text-[#faf6f4] transition-colors hover:bg-[#b85d7c]"
						>
							Kontakt aufnehmen
							<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
						</Link>
						<Link
							href="/studentenzimmer-stuttgart"
							className="inline-flex items-center rounded-full border border-black/10 bg-white px-8 py-4 font-medium transition-colors hover:border-[#b85d7c]/40 hover:text-[#b85d7c]"
						>
							Studentenzimmer ansehen
						</Link>
					</div>
				</section>
			</main>

			<SiteFooter />
		</div>
	);
}
