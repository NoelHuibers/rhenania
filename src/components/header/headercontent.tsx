import Image from "next/image";
import Link from "next/link";
import { FaWikipediaW } from "react-icons/fa6";
import { IoLogoInstagram, IoMailOutline } from "react-icons/io5";

const HeaderContent = () => {
	return (
		<>
			<Link className="items-cente flex" href="/">
				{/* <Image
          src="/zirkel.svg"
          alt="Corps Rhenania Stuttgart Zirkel"
          width={25}
          height={25}
        /> */}
				Rhenania Stuttgart
			</Link>
			<div className="flex items-center space-x-4">
				<Link
					className="hover:text-gray-400"
					href="https://www.instagram.com/corps.rhenania/"
					target="_blank"
				>
					<IoLogoInstagram className="h-6 w-6" />
				</Link>
				<Link
					className="hover:text-gray-400"
					href="https://de.wikipedia.org/wiki/Corps_Rhenania_Stuttgart"
					target="_blank"
				>
					<FaWikipediaW className="h-6 w-6" />
				</Link>
				<Link
					className="hover:text-gray-400"
					href="mailto:corps@rhenania-stuttgart.de"
				>
					<IoMailOutline className="h-6 w-6" />
				</Link>
			</div>
		</>
	);
};

export default HeaderContent;
