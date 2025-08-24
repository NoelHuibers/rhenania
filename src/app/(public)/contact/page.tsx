import { Toaster } from "sonner";
import FooterColored from "~/components/footer/footercolored";
import HeaderColored from "~/components/header/headercolored";
import ContactForm from "./contactform";

export default function HomePage() {
	return (
		<div className="flex h-screen w-screen flex-col">
			<HeaderColored />
			<main className="flex h-full w-full items-center justify-center bg-slate-100 px-2 py-4 dark:bg-gray-800">
				<ContactForm />
				<Toaster />
			</main>
			<FooterColored />
		</div>
	);
}
