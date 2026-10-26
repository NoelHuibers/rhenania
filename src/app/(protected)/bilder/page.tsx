// bilder/page.tsx

import { AdminImageManager as ImagePage } from "~/components/bilder/ImagePage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";

export default function HomePage() {
	return (
		<SidebarLayout>
			<ImagePage />
		</SidebarLayout>
	);
}
