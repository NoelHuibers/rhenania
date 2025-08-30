// bilder/page.tsx

import ImagePage from "~/components/bilder/ImagePage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";

export default function HomePage() {
  return (
    <SidebarLayout>
      <ImagePage />
    </SidebarLayout>
  );
}
