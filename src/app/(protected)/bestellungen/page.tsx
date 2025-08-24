import OrdersTracker from "~/components/orders/Orderspage";
import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import { SiteHeader } from "~/components/trinken/SiteHeader";

export default function ProfilePage() {
  return (
    <SidebarLayout>
      <SiteHeader title="Bestellungen" />
      <OrdersTracker />
    </SidebarLayout>
  );
}
