import {
	ArrowRight,
	Building2,
	Clock3,
	GraduationCap,
	MapPin,
	MessageCircle,
	Train,
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

const DEFAULT_HERO_IMAGE = "/Haus0.png";
const FALLBACK_IMAGES = [
	DEFAULT_HERO_IMAGE,
	"/Haus1.png",
	"/Haus2.png",
	"/Haus3.png",
];

const FAQS: readonly FaqItem[] = [
	{
		question: "Sind aktuell Studentenzimmer in Stuttgart frei?",
		answer:
			"Die Belegung ändert sich im Laufe des Semesters. Schreib uns kurz über das Kontaktformular; wir melden uns mit der aktuellen Verfügbarkeit und möglichen Einzugsterminen.",
	},
	{
		question: "Was kostet ein Zimmer im Corpshaus?",
		answer:
			"Miete, Nebenkosten und Kaution können je nach Zimmer variieren. Die aktuell geltenden Konditionen nennen wir dir transparent bei deiner Anfrage.",
	},
	{
		question: "Sind die Studentenzimmer möbliert und ist Internet vorhanden?",
		answer:
			"Die konkrete Ausstattung kann sich von Zimmer zu Zimmer unterscheiden. Sag uns bei deiner Anfrage, was du brauchst; wir schicken dir die Details zum verfügbaren Zimmer.",
	},
	{
		question: "Wie weit ist das Corpshaus von der Universität entfernt?",
		answer:
			"Das Haus liegt in Stuttgart-Nord nahe dem Universitätszentrum Stadtmitte und etwa zehn Gehminuten vom Hauptbahnhof entfernt. Von dort bestehen gute Verbindungen zu den Campusstandorten Vaihingen und Hohenheim.",
	},
	{
		question: "Kann ich ein Zimmer zunächst unverbindlich anfragen?",
		answer:
			"Ja, du kannst uns zunächst ohne Vorentscheidung kennenlernen. Im persönlichen Gespräch klären wir offen, ob das Zimmer und das gemeinschaftliche Wohnen zu dir passen.",
	},
];

export const metadata: Metadata = createRhenaniaMetadata({
	title: "Studentenzimmer in Stuttgart | Corps Rhenania",
	description:
		"Studentenzimmer in Stuttgart-Nord, rund zehn Gehminuten vom Hauptbahnhof. Wohnen in studentischer Gemeinschaft – Verfügbarkeit direkt anfragen.",
	path: "/studentenzimmer-stuttgart",
});

const breadcrumbJsonLd = createBreadcrumbJsonLd([
	{ name: "Corps Rhenania Stuttgart", path: "/" },
	{ name: "Studentenzimmer Stuttgart", path: "/studentenzimmer-stuttgart" },
]);

export default async function StudentenzimmerStuttgartPage() {
	const tenant = await getCurrentTenant();
	if (tenant?.slug !== "rhenania") {
		notFound();
	}

	const storedImages = await getAllActiveImagesBySection("haus");
	const images =
		storedImages.length > 0
			? storedImages.map((image) => image.imageUrl)
			: FALLBACK_IMAGES;
	const heroImage = images[0] ?? DEFAULT_HERO_IMAGE;

	return (
		<div className="relative min-h-screen bg-[#faf6f4] text-[#2c2630]">
			<JsonLd id="studentenzimmer-breadcrumbs" data={breadcrumbJsonLd} />
			<JsonLd id="studentenzimmer-faq" data={createFaqJsonLd(FAQS)} />
			<SiteHeader displayName={tenant.displayName} />

			<main>
				<section className="relative overflow-hidden px-6 pt-32 pb-20 md:pt-40 md:pb-28">
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 -z-10"
					>
						<div className="absolute -top-44 -left-36 h-[34rem] w-[34rem] rounded-full bg-[#d98aa6]/20 blur-3xl" />
						<div className="absolute -right-40 -bottom-48 h-[38rem] w-[38rem] rounded-full bg-[#2f86d4]/15 blur-3xl" />
					</div>

					<div className="mx-auto max-w-6xl">
						<nav aria-label="Brotkrumen" className="text-[#6f6675] text-sm">
							<Link className="hover:text-[#b85d7c]" href="/">
								Startseite
							</Link>
							<span aria-hidden className="mx-2">
								/
							</span>
							<span>Studentenzimmer Stuttgart</span>
						</nav>

						<div className="mt-10 grid min-w-0 items-center gap-12 lg:grid-cols-[1.02fr_0.98fr]">
							<div className="min-w-0">
								<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
									Studentisches Wohnen · Stuttgart-Nord
								</p>
								<h1 className="mt-5 max-w-3xl hyphens-auto break-words font-heading font-semibold text-4xl leading-[1.03] tracking-tight sm:text-6xl lg:text-7xl">
									Studentenzimmer in Stuttgart – wohnen im Corpshaus
								</h1>
								<p className="mt-7 max-w-2xl text-[#6f6675] text-lg leading-relaxed sm:text-xl">
									Du suchst ein Zimmer für dein Studium in Stuttgart? Bei
									Rhenania verbindest du eine zentrale Lage mit einer
									gewachsenen studentischen Gemeinschaft. Ob gerade ein Zimmer
									frei ist, erfährst du direkt bei uns.
								</p>
								<div className="mt-9 flex flex-wrap gap-4">
									<Link
										href="/contact"
										className="group inline-flex items-center gap-2 rounded-full bg-[#2c2630] px-7 py-3.5 font-medium text-[#faf6f4] transition-colors hover:bg-[#b85d7c]"
									>
										Zimmer anfragen
										<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
									</Link>
									<a
										href="#lage"
										className="inline-flex items-center rounded-full border border-black/10 bg-white/70 px-7 py-3.5 font-medium text-[#2c2630] transition-colors hover:border-[#b85d7c]/40 hover:text-[#b85d7c]"
									>
										Lage ansehen
									</a>
								</div>
							</div>

							<div className="relative aspect-[4/3] min-w-0 overflow-hidden rounded-[2rem] border border-black/5 bg-white shadow-[0_28px_80px_-36px_rgba(44,38,48,0.55)]">
								<Image
									src={heroImage}
									alt="Einblick in das Corpshaus Rhenania in Stuttgart"
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
					id="lage"
					className="border-black/5 border-y bg-white/60 px-6 py-16"
				>
					<div className="mx-auto grid max-w-6xl gap-6 md:grid-cols-3">
						{[
							{
								Icon: MapPin,
								title: "Zentral in Stuttgart-Nord",
								text: "Relenbergstraße 8 in ruhiger Halbhöhenlage – nahe Stadtmitte und Hauptbahnhof.",
							},
							{
								Icon: Clock3,
								title: "Rund 10 Minuten zum Hbf",
								text: "Zu Fuß bist du schnell am Stuttgarter Hauptbahnhof und im Zentrum der Stadt.",
							},
							{
								Icon: Train,
								title: "Gut zur Universität angebunden",
								text: "Kurze Wege zur Stadtmitte und gute Verbindungen zu den Campusstandorten Vaihingen und Hohenheim.",
							},
						].map(({ Icon, title, text }) => (
							<article
								key={title}
								className="rounded-2xl border border-black/5 bg-white p-7"
							>
								<Icon className="h-6 w-6 text-[#b85d7c]" aria-hidden />
								<h2 className="mt-5 font-heading font-semibold text-2xl">
									{title}
								</h2>
								<p className="mt-3 text-[#6f6675] leading-relaxed">{text}</p>
							</article>
						))}
					</div>
				</section>

				<section className="px-6 py-20 md:py-28">
					<div className="mx-auto max-w-6xl">
						<div className="mx-auto max-w-3xl text-center">
							<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
								Mehr als eine Zweck-WG
							</p>
							<h2 className="mt-4 font-heading font-semibold text-4xl tracking-tight sm:text-6xl">
								Wohnen und Gemeinschaft im Studium
							</h2>
							<p className="mt-6 text-[#6f6675] text-lg leading-relaxed">
								Das Rhenanenhaus ist eine persönliche Alternative zum
								klassischen Studentenwohnheim. Hier teilst du nicht nur eine
								Adresse, sondern auch Alltag, Lernen, Kochen und Veranstaltungen
								mit anderen Studenten.
							</p>
						</div>

						<div className="mt-14 grid gap-6 md:grid-cols-3">
							{[
								{
									Icon: Building2,
									title: "Zimmer im Corpshaus",
									text: "Wohnen in einem traditionsreichen Haus mitten in Stuttgart statt in einer anonymen Wohnanlage.",
								},
								{
									Icon: Users,
									title: "Studentische Gemeinschaft",
									text: "Gemeinsam lernen, kochen, Sport treiben und das Stuttgarter Studentenleben gestalten.",
								},
								{
									Icon: GraduationCap,
									title: "Fokus auf dein Studium",
									text: "Ein Umfeld, in dem akademischer Erfolg, Eigenverantwortung und gegenseitige Unterstützung zählen.",
								},
							].map(({ Icon, title, text }) => (
								<article
									key={title}
									className="rounded-2xl border border-black/5 bg-white p-8 shadow-[0_16px_45px_-32px_rgba(44,38,48,0.45)]"
								>
									<div className="inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#d98aa6]/12">
										<Icon className="h-6 w-6 text-[#b85d7c]" aria-hidden />
									</div>
									<h3 className="mt-5 font-heading font-semibold text-2xl">
										{title}
									</h3>
									<p className="mt-3 text-[#6f6675] leading-relaxed">{text}</p>
								</article>
							))}
						</div>

						{images.length > 1 && (
							<div className="mt-16 grid grid-cols-2 gap-4 md:grid-cols-3">
								{images.slice(1, 4).map((src, index) => (
									<div
										key={src}
										className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-black/5 bg-white"
									>
										<Image
											src={src}
											alt={`Einblick in das Corpshaus Rhenania ${index + 2}`}
											fill
											sizes="(max-width: 768px) 50vw, 33vw"
											className="object-cover"
											unoptimized={src.endsWith(".gif")}
										/>
									</div>
								))}
							</div>
						)}
					</div>
				</section>

				<section className="border-black/5 border-y bg-[#f3ebee] px-6 py-20 md:py-28">
					<div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.72fr_1.28fr]">
						<div>
							<p className="font-medium text-[#b85d7c] text-xs uppercase tracking-[0.38em]">
								Fragen zum Wohnen
							</p>
							<h2 className="mt-4 font-heading font-semibold text-4xl tracking-tight sm:text-5xl">
								Häufige Fragen zu unseren Studentenzimmern
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
					<MessageCircle
						className="mx-auto h-8 w-8 text-[#b85d7c]"
						aria-hidden
					/>
					<h2 className="mx-auto mt-6 max-w-3xl font-heading font-semibold text-4xl tracking-tight sm:text-6xl">
						Studentenzimmer in Stuttgart unverbindlich anfragen
					</h2>
					<p className="mx-auto mt-6 max-w-2xl text-[#6f6675] text-lg leading-relaxed">
						Erzähl uns kurz, was du studierst, wann du einziehen möchtest und
						was dir beim Wohnen wichtig ist. Wir melden uns persönlich bei dir.
					</p>
					<div className="mt-9 flex flex-wrap justify-center gap-4">
						<Link
							href="/contact"
							className="group inline-flex items-center gap-2 rounded-full bg-[#2c2630] px-8 py-4 font-medium text-[#faf6f4] transition-colors hover:bg-[#b85d7c]"
						>
							Verfügbarkeit anfragen
							<ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
						</Link>
						<Link
							href="/studentenverbindung-stuttgart"
							className="inline-flex items-center rounded-full border border-black/10 bg-white px-8 py-4 font-medium transition-colors hover:border-[#b85d7c]/40 hover:text-[#b85d7c]"
						>
							Corps kennenlernen
						</Link>
					</div>
				</section>
			</main>

			<SiteFooter />
		</div>
	);
}
