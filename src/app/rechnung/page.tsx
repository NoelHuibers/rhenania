import BillingDashboard from "~/components/rechnungen/BillingDashboard";
import { SidebarLayout } from "~/components/sidebar/sidebar-layout";

export default function Page() {
  return (
    <SidebarLayout>
      <BillingDashboard />
    </SidebarLayout>
  );
}
