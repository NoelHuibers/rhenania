import {
	ArrowRight,
	Beer,
	CalendarDays,
	LogIn,
	Sparkles,
	Trophy,
	UserCircle2,
	Users,
} from "lucide-react";
import Link from "next/link";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import { getCurrentTenant } from "~/server/lib/tenant-context";

export default async function DefaultLandingPage() {
	const tenant = await getCurrentTenant();
	const name = tenant?.displayName ?? "euer Corps";

	return (
		<div className="relative min-h-screen bg-background text-foreground">
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
			>
				<div className="absolute top-[-20%] left-1/2 h-[60rem] w-[60rem] -translate-x-1/2 rounded-full bg-gradient-to-br from-primary/20 via-primary/5 to-transparent blur-3xl" />
				<div className="absolute right-[-10%] bottom-[-30%] h-[40rem] w-[40rem] rounded-full bg-gradient-to-tr from-fuchsia-500/10 via-indigo-500/10 to-transparent blur-3xl" />
				<div
					className="absolute inset-0 opacity-[0.03] [mask-image:radial-gradient(ellipse_at_top,black,transparent_70%)]"
					style={{
						backgroundImage:
							"linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
						backgroundSize: "48px 48px",
					}}
				/>
			</div>

			<header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
				<Link
					href="/"
					className="font-heading font-semibold text-lg tracking-tight"
				>
					{name}
				</Link>
				<Button asChild variant="ghost" size="sm">
					<Link href="/auth/signin">
						<LogIn />
						Anmelden
					</Link>
				</Button>
			</header>

			<main className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-6 pt-16 pb-24">
				<section className="flex flex-col items-center text-center">
					<span className="mb-6 inline-flex items-center gap-2 rounded-full border border-border bg-card/60 px-3 py-1 text-muted-foreground text-xs shadow-xs backdrop-blur">
						<Sparkles className="h-3.5 w-3.5" />
						Frisch eingerichtet
					</span>
					<h1 className="max-w-3xl font-heading font-semibold text-4xl tracking-tight sm:text-6xl">
						Willkommen bei{" "}
						<span className="bg-gradient-to-br from-primary via-primary to-fuchsia-500 bg-clip-text text-transparent">
							{name}
						</span>
					</h1>
					<p className="mt-6 max-w-2xl text-balance text-lg text-muted-foreground leading-relaxed">
						Eure neue Plattform für Mitglieder, Getränke, Rechnungen und
						Veranstaltungen — alles an einem Ort. Diese Startseite ist die
						Standard-Vorlage. Sobald ihr eure eigene gestaltet habt, ersetzt sie
						diese hier.
					</p>
					<div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
						<Button asChild size="lg">
							<Link href="/profile">
								Zum Profil
								<ArrowRight />
							</Link>
						</Button>
						<Button asChild variant="outline" size="lg">
							<Link href="/auth/signin">
								<LogIn />
								Anmelden
							</Link>
						</Button>
					</div>
				</section>

				<section>
					<div className="mb-10 flex flex-col items-center text-center">
						<h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
							Was ihr direkt nutzen könnt
						</h2>
						<p className="mt-3 max-w-2xl text-muted-foreground">
							Kernfunktionen, die für jeden Corps sofort einsatzbereit sind.
						</p>
					</div>
					<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
						<FeatureCard
							icon={<Users className="h-5 w-5" />}
							title="Mitglieder & Profile"
							description="Mitglieder verwalten, Rollen vergeben, Konten im Blick behalten."
						/>
						<FeatureCard
							icon={<Beer className="h-5 w-5" />}
							title="Trinken & Bestellungen"
							description="Bestellungen erfassen, Lager pflegen, Rechnungen erzeugen."
						/>
						<FeatureCard
							icon={<CalendarDays className="h-5 w-5" />}
							title="Semesterprogramm"
							description="Veranstaltungen planen, einladen und teilen — mit Kalender-Feed."
						/>
						<FeatureCard
							icon={<Trophy className="h-5 w-5" />}
							title="ELO & Challenges"
							description="Spiele tracken, Leaderboard pflegen, Challenges austragen."
						/>
					</div>
				</section>

				<section>
					<div className="mb-10 flex flex-col items-center text-center">
						<h2 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
							In drei Schritten startklar
						</h2>
						<p className="mt-3 max-w-2xl text-muted-foreground">
							So bringt ihr {name} live.
						</p>
					</div>
					<ol className="grid grid-cols-1 gap-4 md:grid-cols-3">
						<StepCard
							step={1}
							icon={<LogIn className="h-5 w-5" />}
							title="Anmelden"
							description="Loggt euch mit eurem Account ein, um Zugriff auf den geschützten Bereich zu erhalten."
						/>
						<StepCard
							step={2}
							icon={<UserCircle2 className="h-5 w-5" />}
							title="Profil einrichten"
							description="Hinterlegt eure Daten, prüft Sicherheits­einstellungen und konfiguriert eure Vorlieben."
						/>
						<StepCard
							step={3}
							icon={<Users className="h-5 w-5" />}
							title="Mitglieder einladen"
							description="Ladet weitere Mitglieder ein und legt los — der Rest folgt im Admin-Bereich."
						/>
					</ol>
				</section>

				<section className="overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-primary/10 via-card to-card px-6 py-12 text-center shadow-xs sm:px-12">
					<h3 className="font-heading font-semibold text-2xl tracking-tight sm:text-3xl">
						Bereit, loszulegen?
					</h3>
					<p className="mx-auto mt-3 max-w-xl text-muted-foreground">
						Springt direkt in euer Profil. Den Rest entdeckt ihr von dort aus.
					</p>
					<Button asChild size="lg" className="mt-6">
						<Link href="/profile">
							Profil öffnen
							<ArrowRight />
						</Link>
					</Button>
				</section>
			</main>

			<footer className="border-border border-t">
				<div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-2 px-6 py-6 text-muted-foreground text-sm sm:flex-row">
					<p>
						© {new Date().getFullYear()} {name}
					</p>
					<div className="flex items-center gap-4">
						<Link href="/impressum" className="hover:text-foreground">
							Impressum
						</Link>
						<Link href="/datenschutz" className="hover:text-foreground">
							Datenschutz
						</Link>
					</div>
				</div>
			</footer>
		</div>
	);
}

function FeatureCard({
	icon,
	title,
	description,
}: {
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<Card className="h-full transition-shadow hover:shadow-md">
			<CardHeader>
				<div className="mb-3 inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
					{icon}
				</div>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
		</Card>
	);
}

function StepCard({
	step,
	icon,
	title,
	description,
}: {
	step: number;
	icon: React.ReactNode;
	title: string;
	description: string;
}) {
	return (
		<Card className="relative h-full">
			<CardHeader>
				<div className="mb-3 flex items-center gap-3">
					<span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary font-semibold text-primary-foreground text-sm">
						{step}
					</span>
					<span className="text-muted-foreground">{icon}</span>
				</div>
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent />
		</Card>
	);
}
