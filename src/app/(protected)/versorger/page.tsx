import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import VersorgerPage from "~/components/trinken/versorger/VersorgerPage";

export default function Page() {
  return (
    <SidebarLayout>
      <VersorgerPage />
    </SidebarLayout>
  );
}
