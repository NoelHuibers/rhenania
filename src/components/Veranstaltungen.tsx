const Veranstaltungen = () => {
  return (
    <section className="flex min-h-fit w-full flex-col items-center justify-center bg-gray-300 p-20">
      <h2 className="mb-16 text-center text-4xl font-bold uppercase text-sky-950">
        Kommende Veranstaltungen
      </h2>
      <div className=" flex flex-row justify-between space-x-32">
        <div className="flex flex-col items-center space-y-1">
          <p className="text-2xl text-sky-950">28. September</p>
          <p className="text-xl">Wasenbesuch</p>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <p className="text-2xl text-sky-950">6.-8. Oktober</p>
          <p className="text-xl">Hüttenwocheende</p>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <p className="text-2xl text-sky-950">14. Oktober</p>
          <p className="text-xl">Fahnenaufzug & Ankneipe</p>
        </div>
      </div>
    </section>
  );
};

export default Veranstaltungen;
