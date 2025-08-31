// components/landingpage/veranstaltungen.tsx
const Veranstaltungen = () => {
  return (
    <section className="w-full bg-gray-100 py-12 md:py-24 lg:py-32">
      <div className="container mx-auto space-y-12 px-4 md:px-6">
        <div className="flex flex-col items-center justify-center space-y-4 text-center">
          <div className="space-y-2">
            <h2 className="font-bold text-3xl tracking-tighter sm:text-5xl">
              Kommende Veranstaltungen
            </h2>
          </div>
        </div>
        <div className="flex justify-center w-full">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8 w-full max-w-5xl">
            <div className="flex flex-col gap-2 rounded-lg bg-white p-6 shadow-md h-full min-h-[176px] md:min-h-[176px]">
              <h3 className="font-bold text-lg">Wasen</h3>
              <p className="text-gray-500 text-sm flex-grow">
                Treff uns auf dem Wasen bei einer Maß einem Hendl und einer mega
                Stimmung.
              </p>
              <div className="flex items-center justify-between mt-auto">
                <div className="font-medium text-[#003366] text-sm">
                  1. Oktober 2025
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-white p-6 shadow-md h-full min-h-[176px] md:min-h-[176px]">
              <h3 className="font-bold text-lg">Fahnenaufzug und Ankneipe</h3>
              <p className="text-gray-500 text-sm flex-grow">
                Wir hissen die Fahne und stoßen auf ein neues Semester an.
              </p>
              <div className="flex items-center justify-between mt-auto">
                <div className="font-medium text-[#003366] text-sm">
                  11. Oktober 2025
                </div>
              </div>
            </div>
            <div className="flex flex-col gap-2 rounded-lg bg-white p-6 shadow-md h-full min-h-[176px] md:min-h-[176px]">
              <h3 className="font-bold text-lg">Kart fahren</h3>
              <p className="text-gray-500 text-sm flex-grow">
                Zeig uns dein Können auf der Kartbahn.
              </p>
              <div className="flex items-center justify-between mt-auto">
                <div className="font-medium text-[#003366] text-sm">
                  25. Oktober 2025
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default Veranstaltungen;
