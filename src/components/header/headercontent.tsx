import Link from "next/link";
import { FaWikipediaW } from "react-icons/fa6";
import { IoLogoInstagram, IoMailOutline } from "react-icons/io5";
import { getTenantProfile } from "~/server/lib/tenant-profile";

// Name and links come from the tenant's branding; a link that is not stored
// is left out.
export const HeaderContent = async () => {
	const profile = await getTenantProfile();

	return (
		<>
			<Link className="items-cente flex" href="/">
				{profile.displayName}
			</Link>
			<div className="flex items-center space-x-4">
				{profile.instagramUrl && (
					<Link
						className="hover:text-gray-400"
						href={profile.instagramUrl}
						target="_blank"
						aria-label="Instagram"
					>
						<IoLogoInstagram className="h-6 w-6" />
					</Link>
				)}
				{profile.wikipediaUrl && (
					<Link
						className="hover:text-gray-400"
						href={profile.wikipediaUrl}
						target="_blank"
						aria-label="Wikipedia"
					>
						<FaWikipediaW className="h-6 w-6" />
					</Link>
				)}
				{profile.contactEmail && (
					<Link
						className="hover:text-gray-400"
						href={`mailto:${profile.contactEmail}`}
						aria-label="E-Mail"
					>
						<IoMailOutline className="h-6 w-6" />
					</Link>
				)}
			</div>
		</>
	);
};
