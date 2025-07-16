import Aktivenbilder from "./aktivenbilder";

const Aktive = () => {
	return (
		<section className="w-full py-12 md:py-24 lg:py-32">
			<div className="container space-y-12 px-4 md:px-6">
				<div className="flex flex-col items-center justify-center space-y-4 text-center">
					<div className="space-y-2">
						<h2 className="font-bold text-3xl tracking-tighter sm:text-5xl">
							Leben als Rhenane
						</h2>
						<p className="max-w-[900px] text-gray-500 md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed dark:text-gray-400">
							Unsere Aktiven erleben viele unvergessliche Momente, die sie
							während ihrer Studienzeit begleiten. Von dem alltäglichen wie
							gemeinsames Lernen, Kochen, Feiern und Sport bis hin zum Segeln,
							Skifahren und Reisen.
						</p>
					</div>
				</div>
				<Aktivenbilder />
			</div>
		</section>
	);
};

export default Aktive;
