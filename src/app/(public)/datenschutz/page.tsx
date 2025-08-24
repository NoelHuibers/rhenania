import FooterColored from "~/components/footer/footercolored";
import HeaderColored from "~/components/header/headercolored";
import Datenschutz from "./datenschutz";

export default function HomePage() {
	return (
		<div className="flex w-screen flex-col">
			<HeaderColored />
			<main className="flex h-full w-full items-center justify-center bg-slate-100 py-16 dark:bg-gray-800">
				<Datenschutz />
			</main>
			<FooterColored />
		</div>
	);
}
