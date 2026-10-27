import Link from "next/link";
import {
	addressLine,
	phoneHref,
	type TenantProfile,
} from "~/server/lib/tenant-profile";

const BUTTON =
	"inline-flex h-10 w-fit items-center justify-center self-center rounded-md border border-gray-200 bg-white px-8 font-medium text-sm shadow-sm transition-colors hover:bg-gray-100 hover:text-gray-900 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-gray-950 disabled:pointer-events-none disabled:opacity-50 dark:border-gray-800 dark:bg-gray-950 dark:focus-visible:ring-gray-300 dark:hover:bg-gray-800 dark:hover:text-gray-50";

// The provider data is the tenant's own (branding); nothing is filled in
// from another Corps. Missing data is stated instead of left blank.
const Impressum = ({ profile }: { profile: TenantProfile }) => {
	const address = addressLine(profile);
	const complete = Boolean(address && profile.contactEmail);

	return (
		<div className="flex max-w-2xl flex-col items-center justify-center px-4 text-center md:px-6">
			<div className="flex flex-col space-y-2">
				<h2 className="font-bold text-3xl tracking-tighter md:text-4xl">
					{profile.legalName}
				</h2>
				{address && (
					<p className="text-gray-500 dark:text-gray-400">
						{address}, Deutschland
					</p>
				)}
				{profile.phone && (
					<Link
						className="text-gray-500 dark:text-gray-400"
						href={phoneHref(profile.phone)}
					>
						Telefon: {profile.phone}
					</Link>
				)}
				{profile.contactEmail && (
					<Link
						className="text-gray-500 dark:text-gray-400"
						href={`mailto:${profile.contactEmail}`}
					>
						Email: {profile.contactEmail}
					</Link>
				)}
				{profile.operator && (
					<p className="text-gray-500 dark:text-gray-400">{profile.operator}</p>
				)}
				{profile.representative && (
					<p className="text-gray-500 dark:text-gray-400">
						Vertretungsberechtigt: {profile.representative}
					</p>
				)}
				{!complete && (
					<p className="text-gray-500 dark:text-gray-400">
						Die vollständigen Anbieterangaben sind noch nicht hinterlegt.
					</p>
				)}
				{profile.contactEmail && (
					<Link href={`mailto:${profile.contactEmail}`} className={BUTTON}>
						Schreib uns
					</Link>
				)}
			</div>
		</div>
	);
};

export default Impressum;
