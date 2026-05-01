import Link from "next/link";
import { FaWikipediaW } from "react-icons/fa6";
import { IoLogoInstagram, IoMailOutline } from "react-icons/io5";
import { getCurrentTenant } from "~/server/lib/tenant-context";

// Social links and email below are still Rhenania-hardcoded — they need a
// per-tenant `branding` config (instagram URL, wikipedia URL, contact email)
// before non-Rhenania tenants ship a public site. Tracked as MVP follow-up.
const HeaderContent = async () => {
	const tenant = await getCurrentTenant();
	const name = tenant?.displayName ?? "Corps";

	return (
		<>
			<Link className="items-cente flex" href="/">
				{name}
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
