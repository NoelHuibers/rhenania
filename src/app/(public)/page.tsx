// app/page.tsx

import Footer from "~/components/footer/footer";
import Header from "~/components/header/header";
import Aktive from "~/components/landingpage/aktive";
import ContactUs from "~/components/landingpage/contactus";
import CorpsSection from "~/components/landingpage/corpssection";
import Haus from "~/components/landingpage/haus";
import MainSection from "~/components/landingpage/mainsection";
import Veranstaltungen from "~/components/landingpage/veranstaltungen";
import { getActiveImageBySection } from "~/server/actions/bilder/images";

export default async function HomePage() {
  const headerImage = await getActiveImageBySection("header");
  const backgroundImageUrl = headerImage?.imageUrl || "/stifi.jpg";

  return (
    <>
      <Header />
      <main className="flex w-screen flex-col">
        <div
          className="sticky top-0 h-screen bg-center bg-cover"
          style={{
            backgroundImage: `url('${backgroundImageUrl}')`,
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
