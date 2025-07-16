import Footer from "~/components/footer/footer";
import Header from "~/components/header/header";
import Aktive from "~/components/landingpage/aktive";
import ContactUs from "~/components/landingpage/contactus";
import CorpsSection from "~/components/landingpage/corpssection";
import Haus from "~/components/landingpage/haus";
import MainSection from "~/components/landingpage/mainsection";
import Veranstaltungen from "~/components/landingpage/veranstaltungen";

export default function HomePage() {
	return (
		<>
			<Header />
			<main className="flex w-screen flex-col">
				<div
					className="sticky top-0 h-screen bg-center bg-cover"
					style={{
						backgroundImage: `url('/stifi.jpg')`,
					}}
				>
					<MainSection />
				</div>
				<div className="relative z-10 bg-white">
					<Aktive />
					<Veranstaltungen />
					<Haus />
					<CorpsSection />
					<ContactUs />
				</div>
			</main>
			<Footer />
		</>
	);
}
