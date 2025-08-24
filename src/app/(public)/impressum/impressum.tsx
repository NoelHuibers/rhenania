import Link from "next/link";

const Impressum = () => {
	return (
		<div className="flex max-w-2xl flex-col items-center justify-center px-4 text-center md:px-6">
			<div className="flex flex-col space-y-2">
				<h2 className="font-bold text-3xl tracking-tighter md:text-4xl">
					Corps Rhenania Stuttgart
				</h2>
				<p className="text-gray-500 dark:text-gray-400">
					Relenbergstraße 8, 70174 Stuttgart, Deutschland
				</p>
				<Link
					className="text-gray-500 dark:text-gray-400"
					href="tel:+4971129738"
				>
					Telefon: +49 711 297308
				</Link>
				<Link
					className="text-gray-500 dark:text-gray-400"
					href="mailto:corps@rhenania-stuttgart.de"
				>
					Email: corps@rhenania-stuttgart.de
				</Link>
				<p className="text-gray-500 dark:text-gray-400">
					Verein Alter Herren des Corps Rhenania Stuttgart e.V.
				</p>
				<p className="text-gray-500 dark:text-gray-400">
					Vertretungsberechtigt: Adrian Sigg
				</p>
				<Link
					href="mailto:corps@rhenania-stuttgart.de"
					className="inline-flex h-10 w-fit items-center justify-center self-center rounded-md border border-gray-200 bg-white px-8 font-medium text-sm shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:focus-visible:ring-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50"
				>
					Schreib uns
				</Link>
			</div>
		</div>
	);
};

export default Impressum;
