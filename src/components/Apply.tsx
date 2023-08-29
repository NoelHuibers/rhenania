import Image from "next/image";

const Apply = () => {
  return (
    <section className=" relative z-20 flex h-screen w-screen flex-col items-center justify-center">
      <Image
        src="/stifi.jpg"
        alt="Haus"
        fill={true}
        className="blur-sm filter"
      />
      <a
        className="absolute rounded-full bg-blue-500 px-6 py-3 text-white hover:bg-blue-600"
        href="mailto:subsenior@rhenania-stuttgart.de"
      >
        Jetzt bewerben
      </a>
    </section>
  );
};

export default Apply;
