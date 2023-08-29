import { type NextPage } from "next";
import Head from "next/head";
import Image from "next/image";
import Aktive from "~/components/Aktive";
import Veranstaltungen from "~/components/Veranstaltungen";
import Welcome from "~/components/Welcome";
import Navbar from "~/components/Navbar";
import Haus from "~/components/Haus";
import Apply from "~/components/Apply";
import Footer from "~/components/Footer";

const Home: NextPage = () => {
  return (
    <>
      <Head>
        <title>Corps Rhenania Stuttgart</title>
        <meta name="description" content="Corps Rhenania Stuttgart" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      <main className="relative min-h-screen w-screen">
        <Navbar />
        <Image src="/bckg.png" alt="background" className="z-10" fill={true} priority/>
      </main>
      <Welcome />
      <Aktive />
      <Veranstaltungen />
      <Haus />
      <Apply />
      <Footer />
    </>
  );
};

export default Home;
