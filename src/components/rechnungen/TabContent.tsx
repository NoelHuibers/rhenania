// Generic Tab Content Component

import type { BillingEntry } from "~/app/rechnung/page";
import { BillingCard } from "./BillingCard";
import { BillingTable } from "./BillingTable";

interface TabContentProps {
  entries: BillingEntry[];
  isLoading: boolean;
  error: string | null;
  cardTitle: string;
  cardDescription: string;
  headerDate?: string;
  showStatus?: boolean;
  emptyMessage?: string;
  onStatusChange?: (entryId: string, newStatus: BillingEntry["status"]) => void;
  detailsComponent?: React.ComponentType<{ entry: BillingEntry }>;
}

export const TabContent = ({
  entries,
  isLoading,
  error,
  cardTitle,
  cardDescription,
  headerDate,
  showStatus = false,
  emptyMessage,
  onStatusChange,
  detailsComponent,
}: TabContentProps) => (
  <BillingCard
    title={cardTitle}
    description={cardDescription}
    headerDate={headerDate}
  >
    <BillingTable
      entries={entries}
      showStatus={showStatus}
      isLoading={isLoading}
      error={error}
      emptyMessage={emptyMessage}
      onStatusChange={onStatusChange}
      detailsComponent={detailsComponent}
    />
  </BillingCard>
);
