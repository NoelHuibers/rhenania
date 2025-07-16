import Link from "next/link";

const Footercontent = () => {
	return (
		<div className="flex flex-col space-y-2 pl-4 text-gray-500 md:flex-row md:items-center md:justify-between md:space-y-0 md:px-8 dark:text-gray-400">
			<div className="flex flex-col md:flex-col">
				<p className="font-bold">Kontakt</p>
				<div className="flex space-x-1 md:space-x-2">
					<p>Telefon:</p>
					<Link className="hover:underline" href="tel:+4971129738">
						+49 711 297308
					</Link>
				</div>
				<div className="flex space-x-1 md:space-x-2">
					<p className="whitespace-nowrap">E-Mail:</p>
					<Link
						className="hover:underline"
						href="mailto:corps@rhenania-stuttgart.de"
					>
						corps@rhenania-stuttgart.de
					</Link>
				</div>
			</div>
			<div className="flex-1 flex-col md:px-48">
				<p className="font-bold">Adresse</p>
				<p>Relenbergstraße 8</p>
				<p>70174 Stuttgart</p>
			</div>
			<div className="flex space-x-2 md:flex-col md:space-x-0">
				<Link
					className="font-bold text-gray-500 hover:underline dark:text-gray-400"
					href="/impressum"
					prefetch={false}
				>
					Impressum
				</Link>
				<Link
					className="font-bold text-gray-500 hover:underline dark:text-gray-400"
					href="/datenschutz"
					prefetch={false}
				>
					Datenschutz
				</Link>
			</div>
		</div>
	);
};

export default Footercontent;
