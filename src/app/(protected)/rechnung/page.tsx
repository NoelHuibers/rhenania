import BillingDashboard from "~/components/rechnungen/BillingDashboard";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";

export default function Page() {
  return (
    <SidebarLayout>
      <BillingDashboard />
    </SidebarLayout>
  );
}
