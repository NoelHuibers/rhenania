import Link from "next/link";

export function SiteFooter() {
	return (
		<footer className="relative z-10 border-black/5 border-t bg-[#f3ebee] px-6 py-8 text-[#6f6675] md:px-12">
			<div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 md:grid-cols-4">
				<div>
					<p className="font-heading font-semibold text-[#2c2630]">Kontakt</p>
					<div className="mt-2 flex flex-col gap-1 text-sm">
						<Link
							className="transition-colors hover:text-[#b85d7c]"
							href="tel:+49711297308"
						>
							Telefon: +49 711 297308
						</Link>
						<Link
							className="transition-colors hover:text-[#b85d7c]"
							href="mailto:corps@rhenania-stuttgart.de"
						>
							corps@rhenania-stuttgart.de
						</Link>
					</div>
				</div>

				<div>
					<p className="font-heading font-semibold text-[#2c2630]">Adresse</p>
					<div className="mt-2 flex flex-col gap-1 text-sm">
						<span>Relenbergstraße 8</span>
						<span>70174 Stuttgart</span>
					</div>
				</div>

				<div>
					<p className="font-heading font-semibold text-[#2c2630]">
						Mitglieder
					</p>
					<div className="mt-2 flex flex-col gap-1 text-sm">
						<Link
							className="transition-colors hover:text-[#b85d7c]"
							href="/profile"
							prefetch={false}
						>
							Intranet-Login
						</Link>
					</div>
				</div>

				<div className="md:text-right">
					<p className="font-heading font-semibold text-[#2c2630]">
						Rechtliches
					</p>
					<div className="mt-2 flex flex-col gap-1 text-sm md:items-end">
						<Link
							className="transition-colors hover:text-[#b85d7c]"
							href="/impressum"
							prefetch={false}
						>
							Impressum
						</Link>
						<Link
							className="transition-colors hover:text-[#b85d7c]"
							href="/datenschutz"
							prefetch={false}
						>
							Datenschutz
						</Link>
					</div>
				</div>
			</div>
		</footer>
	);
}
