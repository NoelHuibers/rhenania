import Hauscarousel from "./hauscarousel";

const Haus = () => {
	return (
		<section className="w-full py-12 md:py-24 lg:py-32">
			<div className="space-y-12 px-4 md:px-6">
				<div className="flex flex-col items-center justify-center space-y-4 text-center">
					<div className="space-y-2">
						<h2 className="font-bold text-3xl tracking-tighter sm:text-5xl">
							Unser Haus
						</h2>
						<p className="max-w-[900px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
							Unser Haus liegt in der Nähe des Universitätszentrums Stadtmitte
							in schöner nördlicher Halbhöhenlage, etwa 10 Gehminuten vom
							Hauptbahnhof entfernt. Die sehr gute Anbindung an die
							Campusuniversitäten Vaihingen und Hohenheim ermöglicht das Wohnen
							und Feiern in der Landeshauptstadt und das Studieren am Campus.
						</p>
					</div>
				</div>
				<Hauscarousel />
			</div>
		</section>
	);
};

export default Haus;
