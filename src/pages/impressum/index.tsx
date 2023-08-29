import type { NextPage } from "next";

const Home: NextPage = () => {
  return (
    <main className="m-auto min-h-screen w-full p-16 text-center">
      <h1 className="text-xl uppercase text-slate-400">Impressum</h1>
      <p>Angaben gemäß § 5 TMG</p>
      <p>Alt Herren Verein des Corps Rhenania Stuttgart</p>
      <p>Relenbergstraße 8</p>
      <p>70174 Stuttgart</p>
      <p>Vertreten durch:</p>
      <p>1. Vorsitzender: Adrian Sigg</p>
    </main>
  );
};

export default Home;
