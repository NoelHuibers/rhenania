import Link from "next/link";

//Make an React component, that is an impressum in the footer of the page
const Footer = () => {
  return (
    <footer>
      <div className="relative flex h-32 flex-row items-center justify-center gap-2 space-x-36 bg-gray-800 font-semibold text-gray-300">
        <div className="flex flex-col">
          <h5 className="text-2xl">Adresse</h5>
          <p>Relenbergstraße 8</p>
          <p>70174 Stuttgart</p>
        </div>
        <div className="flex flex-col">
          <h5 className="text-2xl">Kontakt</h5>
          <div>
            <a href="tel:+49711297308">0711 297308</a>
          </div>
          <a href="mailto:subsenior@rhenania-stuttgart.de">
            subsenior@rhenania-stuttgart.de
          </a>
        </div>
        <div className="flex flex-col">
          <h5 className="text-2xl">Links</h5>
          <Link href={"/impressum"}>Impressum</Link>
          <Link href={"/datenschutz"}>Datenschutz</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
