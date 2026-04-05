import { SemProQRCode } from "./SemProQRCode";

export function SemProGenerieren({ calendarUrl }: { calendarUrl: string }) {
	return (
		<div className="space-y-6">
			<section className="rounded-xl border bg-card p-6">
				<h3 className="mb-1 font-semibold text-sm">Kalender QR-Code</h3>
				<p className="text-muted-foreground text-xs">
					QR-Code zum Abonnieren des Semesterprogramms als PNG herunterladen.
				</p>
				<SemProQRCode url={calendarUrl} />
			</section>
		</div>
	);
}
