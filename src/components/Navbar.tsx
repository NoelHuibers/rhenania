import { signIn, signOut, useSession } from "next-auth/react";

import { AiOutlineInstagram } from "react-icons/ai";
import { FaWikipediaW } from "react-icons/fa";
import { FiMail } from "react-icons/fi";
import { BiUserCircle } from "react-icons/bi";
import { FaUserGraduate } from "react-icons/fa";

const Navbar: React.FC = () => {
  return (
    <>
      <div className="absolute z-20 flex h-16 w-full items-center justify-between px-4">
        <h1 className="mx-auto text-3xl font-bold text-white">
          Corps Rhenania Stuttgart
        </h1>
      </div>
      <nav className="fixed z-30 flex h-16 w-full items-center justify-between">
        <Buttons />
      </nav>
    </>
  );
};

const Buttons: React.FC = () => {
  return (
    <div className="ml-auto mr-4 flex flex-row items-center justify-center gap-2">
      <a
        className="text-white no-underline hover:underline"
        href="https://www.instagram.com/corps.rhenania/"
        target="_blank"
        rel="noreferrer"
        aria-label="Instagram Link"
      >
        <AiOutlineInstagram className="h-6 w-6" />
      </a>
      <a
        className="text-white no-underline hover:underline"
        href="mailto:subsenior@rhenania-stuttgart.de
            "
        target="_blank"
        rel="noreferrer"
        aria-label="Mail Link"
      >
        <FiMail className="h-6 w-6" />
      </a>
      <a
        className="text-white no-underline hover:underline"
        href="https://de.wikipedia.org/wiki/Corps_Rhenania_Stuttgart"
        target="_blank"
        rel="noreferrer"
        aria-label="Wikipedia Link"
      >
        <FaWikipediaW className="h-6 w-6" />
      </a>
      <Login />
    </div>
  );
};

const Login: React.FC = () => {
  const { data: sessionData } = useSession();

  return (
    <div className="flex flex-col items-center justify-center gap-2 text-white ">
      <button
        onClick={sessionData ? () => void signOut() : () => void signIn()}
        aria-label="Login Button"
      >
        {sessionData ? (
          <FaUserGraduate className="h-6 w-6" />
        ) : (
          <BiUserCircle className="h-6 w-6" />
        )}
      </button>
    </div>
  );
};

export default Navbar;
