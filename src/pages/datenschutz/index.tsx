import type { NextPage } from "next";
import Footer from "~/components/Footer";
import Navbar2 from "~/components/Navbar2";

const Home: NextPage = () => {
  return (
    <main className="m-auto min-h-screen w-full">
      <Navbar2 />
      <div className="p-16">
        <div className="text-center">
          <h1 className="text-4xl font-bold uppercase text-sky-950">
            Datenschutz
          </h1>
          <p className="py-2">
            Verantwortlicher im Sinne der Datenschutzgesetze, insbesondere der
            EU-Datenschutzgrundverordnung (DSGVO), ist:
          </p>
          <h2 className="text-2xl font-bold uppercase text-sky-950">
            Corps Rhenania Stuttgart
          </h2>
          <p className="py-2">rechtlich vertreten durch die Vereinigung:</p>
          <h2 className="text-2xl font-bold uppercase text-sky-950">
            Corps Rhenania Stuttgart e.V.
          </h2>
          <p>Relenbergstraße 8, 70174 Stuttgart</p>
        </div>
        <h2 className="mt-2 text-left text-xl font-bold uppercase text-sky-900">
          Ihre Betroffenenrechte
        </h2>
        <p>
          Unter den angegebenen Kontaktdaten unseres Datenschutzbeauftragten
          können Sie jederzeit folgende Rechte ausüben: Auskunft über Ihre bei
          uns gespeicherten Daten und deren Verarbeitung (Art. 15 DSGVO),
          Berichtigung unrichtiger personenbezogener Daten (Art. 16 DSGVO),
          Löschung Ihrer bei uns gespeicherten Daten (Art. 17 DSGVO),
          Einschränkung der Datenverarbeitung, sofern wir Ihre Daten aufgrund
          gesetzlicher Pflichten noch nicht löschen dürfen (Art. 18 DSGVO),
          Widerspruch gegen die Verarbeitung Ihrer Daten bei uns (Art. 21 DSGVO)
          und Datenübertragbarkeit, sofern Sie in die Datenverarbeitung
          eingewilligt haben oder einen Vertrag mit uns abgeschlossen haben
          (Art. 20 DSGVO). Sofern Sie uns eine Einwilligung erteilt haben,
          können Sie diese jederzeit mit Wirkung für die Zukunft widerrufen. Sie
          können sich jederzeit mit einer Beschwerde an eine Aufsichtsbehörde
          wenden, z. B. an die zuständige Aufsichtsbehörde des Bundeslands Ihres
          Wohnsitzes oder an die für uns als verantwortliche Stelle zuständige
          Behörde.
        </p>
        <h2 className="mt-2 text-left text-xl font-bold uppercase text-sky-900">
          Erfassung allgemeiner Informationen beim Besuch unserer Website
        </h2>
        <p>
          Art und Zweck der Verarbeitung Wenn Sie auf unsere Website zugreifen,
          d.h., wenn Sie sich nicht registrieren oder anderweitig Informationen
          übermitteln, werden automatisch Informationen allgemeiner Natur
          erfasst. Diese Informationen (Server-Logfiles) beinhalten etwa die Art
          des Webbrowsers, das verwendete Betriebssystem, den Domainnamen Ihres
          Internet-Service-Providers, Ihre IP-Adresse und ähnliches. Sie werden
          insbesondere zu folgenden Zwecken verarbeitet: Sicherstellung eines
          problemlosen Verbindungsaufbaus der Website, Sicherstellung einer
          reibungslosen Nutzung unserer Website, Auswertung der Systemsicherheit
          und -stabilität sowie zu weiteren administrativen Zwecken. Wir
          verwenden Ihre Daten nicht, um Rückschlüsse auf Ihre Person zu ziehen.
          Informationen dieser Art werden von uns ggfs. statistisch ausgewertet,
          um unseren Internetauftritt und die dahinterstehende Technik zu
          optimieren.
        </p>
        <h2 className="mt-2 text-left text-xl font-bold uppercase text-sky-900">
          SSL-Verschlüsselung
        </h2>
        <p>
          Um die Sicherheit Ihrer Daten bei der Übertragung zu schützen,
          verwenden wir dem aktuellen Stand der Technik entsprechende
          Verschlüsselungsverfahren (z. B. SSL/TLS) über HTTPS.
        </p>
        <h2 className="mt-2 text-left text-xl font-bold uppercase text-sky-900">
          Änderung unserer Datenschutzbestimmungen
        </h2>
        <p>
          Wir behalten uns vor, diese Datenschutzerklärung anzupassen, damit sie
          stets den aktuellen rechtlichen Anforderungen entspricht oder um
          Änderungen unserer Leistungen in der Datenschutzerklärung umzusetzen,
          z.B. bei der Einführung neuer Services. Für Ihren erneuten Besuch gilt
          dann die neue Datenschutzerklärung.
        </p>
      </div>
      <Footer />
    </main>
  );
};

export default Home;
