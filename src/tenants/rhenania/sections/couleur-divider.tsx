import { PALETTE } from "../theme";

// The recurring Couleur motif: a slim tricolor rule that threads the sections
// together, with a gilded Zirkel-dot at its centre.
export function CouleurDivider({ className = "" }: { className?: string }) {
	return (
		<div
			aria-hidden
			className={`relative mx-auto flex w-full max-w-5xl items-center justify-center px-6 py-6 md:py-10 ${className}`}
		>
			<span
				className="h-px flex-1"
				style={{
					background: `linear-gradient(90deg, transparent, ${PALETTE.rose} 35%, ${PALETTE.azure} 75%, transparent)`,
				}}
			/>
			<span
				className="mx-3 inline-block h-2 w-2 rotate-45 ring-1 ring-black/10"
				style={{
					backgroundColor: PALETTE.silver,
				}}
			/>
			<span
				className="h-px flex-1"
				style={{
					background: `linear-gradient(90deg, transparent, ${PALETTE.azure} 25%, ${PALETTE.rose} 65%, transparent)`,
				}}
			/>
		</div>
	);
}
