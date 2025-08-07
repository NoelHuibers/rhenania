import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface BillingCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  headerDate?: string;
}

// Generic Billing Card Component
export const BillingCard = ({
  title,
  description,
  children,
  headerDate,
}: BillingCardProps) => (
  <Card>
    <CardHeader>
      <div className="flex justify-between items-start">
        <div>
          <CardTitle>{title}</CardTitle>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        {headerDate && (
          <div className="text-sm text-muted-foreground">{headerDate}</div>
        )}
      </div>
    </CardHeader>
    <CardContent>{children}</CardContent>
  </Card>
);
