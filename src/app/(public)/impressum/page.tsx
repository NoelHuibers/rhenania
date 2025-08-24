import FooterColored from "~/components/footer/footercolored";
import HeaderColored from "~/components/header/headercolored";
import Impressum from "./impressum";

export default function HomePage() {
	return (
		<div className="flex h-screen w-screen flex-col">
			<HeaderColored />
			<main className="flex h-full w-full items-center justify-center bg-slate-100 dark:bg-gray-800">
				<Impressum />
			</main>
			<FooterColored />
		</div>
	);
}
