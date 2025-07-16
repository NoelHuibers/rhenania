import Link from "next/link";

const Datenschutzerklaerung = () => {
	return (
		<div className="flex max-w-2xl flex-col items-center justify-center px-4 text-center md:px-6">
			<div className="flex flex-col space-y-2">
				<h2 className="font-bold text-3xl tracking-tighter md:text-4xl">
					Datenschutzerklärung
				</h2>
				<p className="text-gray-500 dark:text-gray-400">
					Der Schutz Ihrer Daten ist uns ein wichtiges Anliegen. Nachfolgend
					informieren wir Sie über die Erhebung, Verarbeitung und Nutzung
					personenbezogener Daten im Rahmen der Nutzung unserer Website.
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Verantwortliche Stelle
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Verein Alter Herren des Corps Rhenania Stuttgart e.V.
					<br />
					Relenbergstraße 8, 70174 Stuttgart, Deutschland
				</p>
				<p className="text-gray-500 dark:text-gray-400">
					Vertretungsberechtigt: Adrian Sigg
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Erhebung und Verarbeitung personenbezogener Daten
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Wir erheben personenbezogene Daten nur, wenn Sie uns diese freiwillig
					über das Kontaktformular zur Verfügung stellen oder wenn Sie unsere
					Website nutzen (z.B. über Vercel Analytics).
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Verwendung von Vercel Analytics
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Unsere Website verwendet Vercel Analytics zur Analyse des
					Nutzungsverhaltens. Die Daten werden anonymisiert erfasst und dienen
					zur Verbesserung unserer Website.
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Kontaktformular
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Wenn Sie uns über das Kontaktformular kontaktieren, speichern wir Ihre
					Angaben (Name, E-Mail-Adresse, Nachricht), um Ihre Anfrage zu
					bearbeiten. Diese Daten werden nicht ohne Ihre ausdrückliche
					Einwilligung an Dritte weitergegeben.
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Verwendung von Bildern
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Auf unserer Website verwendete Bilder von Personen wurden mit deren
					ausdrücklicher Einwilligung veröffentlicht. Die Einwilligung kann
					jederzeit widerrufen werden.
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					SSL-Verschlüsselung
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Um die Sicherheit Ihrer Daten bei der Übertragung zu schützen,
					verwenden wir dem aktuellen Stand der Technik entsprechende
					Verschlüsselungsverfahren (z. B. SSL/TLS) über HTTPS.
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Ihre Rechte
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Sie haben das Recht auf Auskunft, Berichtigung, Löschung und
					Einschränkung der Verarbeitung Ihrer personenbezogenen Daten sowie das
					Recht auf Widerspruch und Datenübertragbarkeit.
				</p>

				<h3 className="mt-4 font-bold text-2xl tracking-tighter md:text-3xl">
					Änderung unserer Datenschutzbestimmungen
				</h3>
				<p className="text-gray-500 dark:text-gray-400">
					Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie
					stets den aktuellen rechtlichen Anforderungen entspricht oder um
					Änderungen unserer Leistungen in der Datenschutzerklärung umzusetzen,
					z.B. bei der Einführung neuer Services. Für Ihren erneuten Besuch gilt
					dann die neue Datenschutzerklärung.
				</p>

				<Link
					href="mailto:corps@rhenania-stuttgart.de"
					className="inline-flex h-10 w-fit items-center justify-center self-center rounded-md border border-gray-200 bg-white px-8 font-medium text-sm shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:focus-visible:ring-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
				>
					Kontaktieren Sie uns
				</Link>
			</div>
		</div>
	);
};

export default Datenschutzerklaerung;
