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
            Impressum
          </h1>
          <p className="py-2">Angaben gemäß §5 TMG:</p>
          <h2 className="mt-2 text-2xl font-bold uppercase text-sky-950">
            Herausgeber
          </h2>
          <p>Alt Herren Verein des Corps Rhenania Stuttgart</p>
          <p>Relenbergstraße 8, 70174 Stuttgart</p>
          <h3 className="mt-2 text-xl font-bold uppercase text-sky-950">
            Vertreten durch
          </h3>
          <p>Herrn Adrian Sigg</p>
        </div>
        <h2 className="mt-2 text-left text-xl font-bold uppercase text-sky-900">
          Haftungsausschluss – Disclaimer:
        </h2>
        <h3 className="mt-2 font-bold uppercase text-sky-900 marker:text-xl">
          Haftung für Inhalte
        </h3>
        <p>
          Alle Inhalte unseres Internetauftritts wurden mit größter Sorgfalt und
          nach bestem Gewissen erstellt. Für die Richtigkeit, Vollständigkeit
          und Aktualität der Inhalte können wir jedoch keine Gewähr übernehmen.
          Als Diensteanbieter sind wir gemäß §7 Abs.1 TMG für eigene Inhalte auf
          diesen Seiten nach den allgemeinen Gesetzen verantwortlich. Nach §§ 8
          bis 10 TMG sind wir als Diensteanbieter jedoch nicht verpflichtet,
          übermittelte oder gespeicherte fremde Informationen zu überwachen oder
          nach Umständen zu forschen, die auf eine rechtswidrige Tätigkeit
          hinweisen. Verpflichtungen zur Entfernung oder Sperrung der Nutzung
          von Informationen nach den allgemeinen Gesetzen bleiben hiervon
          unberührt. Eine diesbezügliche Haftung ist jedoch erst ab dem
          Zeitpunkt der Kenntniserlangung einer konkreten Rechtsverletzung
          möglich. Bei Bekanntwerden von den o.g. Rechtsverletzungen werden wir
          diese Inhalte unverzüglich entfernen.{" "}
        </p>
        <h3 className="mt-2 font-bold uppercase text-sky-900 marker:text-xl">
          Haftungsbeschränkung für externe Links
        </h3>
        <p>
          Unsere Webseite enthält Links auf externe Webseiten Dritter. Auf die
          Inhalte dieser direkt oder indirekt verlinkten Webseiten haben wir
          keinen Einfluss. Daher können wir für die „externen Links“ auch keine
          Gewähr auf Richtigkeit der Inhalte übernehmen. Für die Inhalte der
          externen Links sind die jeweilige Anbieter oder Betreiber (Urheber)
          der Seiten verantwortlich. Die externen Links wurden zum Zeitpunkt der
          Linksetzung auf eventuelle Rechtsverstöße überprüft und waren im
          Zeitpunkt der Linksetzung frei von rechtswidrigen Inhalten. Eine
          ständige inhaltliche Überprüfung der externen Links ist ohne konkrete
          Anhaltspunkte einer Rechtsverletzung nicht möglich. Bei direkten oder
          indirekten Verlinkungen auf die Webseiten Dritter, die außerhalb
          unseres Verantwortungsbereichs liegen, würde eine
          Haftungsverpflichtung ausschließlich in dem Fall nur bestehen, wenn
          wir von den Inhalten Kenntnis erlangen und es uns technisch möglich
          und zumutbar wäre, die Nutzung im Falle rechtswidriger Inhalte zu
          verhindern. Diese Haftungsausschlusserklärung gilt auch innerhalb des
          eigenen Internetauftrittes „Name Ihrer Domain“ gesetzten Links und
          Verweise von Fragestellern, Blogeinträgern, Gästen des
          Diskussionsforums. Für illegale, fehlerhafte oder unvollständige
          Inhalte und insbesondere für Schäden, die aus der Nutzung oder
          Nichtnutzung solcherart dargestellten Informationen entstehen, haftet
          allein der Diensteanbieter der Seite, auf welche verwiesen wurde,
          nicht derjenige, der über Links auf die jeweilige Veröffentlichung
          lediglich verweist. Werden uns Rechtsverletzungen bekannt, werden die
          externen Links durch uns unverzüglich entfernt.
        </p>
        <h3 className="mt-2 font-bold uppercase text-sky-900 marker:text-xl">
          Urheberrecht
        </h3>
        <p>
          Die auf unserer Webseite veröffentlichen Inhalte und Werke unterliegen
          dem deutschen Urheberrecht
          (http://www.gesetze-im-internet.de/bundesrecht/urhg/gesamt.pdf) . Die
          Vervielfältigung, Bearbeitung, Verbreitung und jede Art der Verwertung
          des geistigen Eigentums in ideeller und materieller Sicht des Urhebers
          außerhalb der Grenzen des Urheberrechtes bedürfen der vorherigen
          schriftlichen Zustimmung des jeweiligen Urhebers i.S.d.
          Urhebergesetzes
          (http://www.gesetze-im-internet.de/bundesrecht/urhg/gesamt.pdf ).
          Downloads und Kopien dieser Seite sind nur für den privaten und nicht
          kommerziellen Gebrauch erlaubt. Sind die Inhalte auf unserer Webseite
          nicht von uns erstellt wurden, sind die Urheberrechte Dritter zu
          beachten. Die Inhalte Dritter werden als solche kenntlich gemacht.
          Sollten Sie trotzdem auf eine Urheberrechtsverletzung aufmerksam
          werden, bitten wir um einen entsprechenden Hinweis. Bei Bekanntwerden
          von Rechtsverletzungen werden wir derartige Inhalte unverzüglich
          entfernen.
        </p>
      </div>
      <Footer />
    </main>
  );
};

export default Home;
