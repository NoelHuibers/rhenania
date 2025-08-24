import { SidebarLayout } from "~/components/sidebar/SidebarLayout";
import DrinksMenu from "~/components/trinken/drinks/DrinksMenu";

export default function Page() {
  return (
    <SidebarLayout>
      <DrinksMenu />
    </SidebarLayout>
  );
}
