const Welcome = () => {
  return (
    <section className="flex min-h-fit w-full flex-col items-center justify-center p-20">
      <h2 className="text-center text-4xl font-bold uppercase text-sky-950">
        Willkommen bei den Rhenanen
      </h2>
      <p className="mb-16 text-center text-xl">
        Wir sind eine Studentenverbindung an der Universität Stuttgart. Unsere
        Mitglieder kommen aus allen Fachbereichen und Semestern. Wir sind
        politisch und konfessionell ungebunden.
      </p>
      <div className=" flex flex-row justify-between space-x-32">
        <div className="flex flex-col items-center space-y-1">
          <p className="text-2xl text-sky-950">Erfolgreiches Studium</p>
          <p className="text-center text-xl">
            Erfolgreiches studieren in einer zielstrebigen Gemeinschaft legt bei
            uns den Grundstein für eine angestrebte Karriere im eigenen
            Fachbereich.
          </p>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <p className="text-2xl text-sky-950">Gemeinschaft</p>
          <p className="text-center text-xl">
            Wir machen Sport, feiern und Unternehmen viel gemeinsam. Der Spaß
            und die Ablenkung neben dem Studium darf nicht fehlen!
          </p>
        </div>
        <div className="flex flex-col items-center space-y-1">
          <p className="text-2xl text-sky-950">Verantwortung übernehmen</p>
          <p className="text-center text-xl">
            Bei uns lernst du das Übernehmen von Verantwortung für das spätere
            Berufsleben. Das Haus wird von den Bewohnern zum größten Teil in
            Eigenenergie gemanaged
          </p>
        </div>
      </div>
    </section>
  );
};

export default Welcome;
