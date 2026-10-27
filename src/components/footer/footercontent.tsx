import Link from "next/link";
import { getTenantProfile, phoneHref } from "~/server/lib/tenant-profile";

// Contact data and address come from the tenant's branding; what is not
// stored is left out.
export const Footercontent = async () => {
	const profile = await getTenantProfile();
	const hasContact = Boolean(profile.phone || profile.contactEmail);
	const hasAddress = Boolean(profile.street || profile.city);

	return (
		<div className="flex flex-col space-y-2 pl-4 text-gray-500 md:flex-row md:items-center md:justify-between md:space-y-0 md:px-8 dark:text-gray-400">
			<div className="flex flex-col md:flex-col">
				{hasContact && <p className="font-bold">Kontakt</p>}
				{profile.phone && (
					<div className="flex space-x-1 md:space-x-2">
						<p>Telefon:</p>
						<Link className="hover:underline" href={phoneHref(profile.phone)}>
							{profile.phone}
						</Link>
					</div>
				)}
				{profile.contactEmail && (
					<div className="flex space-x-1 md:space-x-2">
						<p className="whitespace-nowrap">E-Mail:</p>
						<Link
							className="hover:underline"
							href={`mailto:${profile.contactEmail}`}
						>
							{profile.contactEmail}
						</Link>
					</div>
				)}
			</div>
			<div className="flex-1 flex-col md:px-48">
				{hasAddress && <p className="font-bold">Adresse</p>}
				{profile.street && <p>{profile.street}</p>}
				{profile.city && <p>{profile.city}</p>}
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
