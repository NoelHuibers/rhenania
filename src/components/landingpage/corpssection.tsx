import { BookOpenIcon, ShieldCheck, Users } from "lucide-react";
import type { JSX } from "react";

interface PillarCardProps {
	icon: JSX.Element;
	title: string;
	description: string;
	color: string;
}

const CorpsSection = () => {
	return (
		<section className="w-full bg-gradient-to-br bg-gray-100 py-12 md:py-24 lg:py-32">
			<div className="container px-4 md:px-6">
				<h2 className="pb-12 text-center font-bold text-3xl tracking-tighter sm:text-4xl md:text-5xl">
					Das Corps
				</h2>
				<div className="grid gap-8 pb-12 md:grid-cols-3">
					<PillarCard
						icon={<BookOpenIcon className="h-8 w-8 text-red-100" />}
						title="Erfolgreiches studieren"
						description="Gemeinschaft mit einem klaren Fokus auf akademischen Erfolg. Wir lernen und feiern gemeinsam!"
						color="bg-red-100"
					/>
					<PillarCard
						icon={<Users className="h-8 w-8 text-slate-100" />}
						title="Verantwortung übernehmen"
						description="Übernimm Verantwortung bei uns und hab Spaß dabei, dich zu engagieren. Das Haus wird weitgehend von den Bewohnern selbst verwaltet."
						color="bg-white"
					/>
					<PillarCard
						icon={<ShieldCheck className="h-8 w-8 text-blue-100" />}
						title="Tolerante Gemeinschaft"
						description="Das Corps ist eine tolerante und liberale Gemeinschaft von Studenten und Alumni. Wir sind unpolitisch und nicht konfessionell."
						color="bg-blue-100"
					/>
				</div>
				<p className="text-center font-semibold text-xl ">
					Schließe dich uns an, um ein Umfeld für ein erfolgreiches, glückliches
					und einzigartiges Studium zu schaffen!
				</p>
			</div>
		</section>
	);
};

const PillarCard: React.FC<PillarCardProps> = ({
	icon,
	title,
	description,
	color,
}) => {
	return (
		<div className="group relative h-full">
			<div
				className={`absolute inset-0 ${color} transform rounded-lg transition-all duration-300 group-hover:rotate-3 group-hover:scale-105`}
			/>
			<div className="group-hover:-translate-y-2 relative flex h-full transform flex-col rounded-lg bg-white p-6 shadow-xl transition-all duration-300">
				<div className="mb-4 flex items-center justify-center">
					{icon}
					<h3 className="ml-3 text-center font-bold text-xl">{title}</h3>
				</div>
				<p className="flex-grow text-center text-gray-600">{description}</p>
			</div>
		</div>
	);
};

export default CorpsSection;
