// Generic Tab Content Component

import { BillingCard } from "./BillingCard";
import type { BillingEntry } from "./BillingDashboard";
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
  canEditStatus?: boolean;
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
  canEditStatus,
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
      canEditStatus={canEditStatus}
    />
  </BillingCard>
);
