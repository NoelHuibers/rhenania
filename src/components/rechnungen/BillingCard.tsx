import type React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

interface BillingCardProps {
  title: string;
  description: string;
  children: React.ReactNode;
  headerDate?: string;
}

export const BillingCard = ({
  title,
  description,
  children,
  headerDate,
}: BillingCardProps) => (
  <Card>
    <CardHeader className="pb-3">
      <div className="flex flex-col space-y-2 sm:flex-row sm:justify-between sm:items-start sm:space-y-0">
        <div className="flex-1 min-w-0">
          <CardTitle className="text-lg sm:text-xl">{title}</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">{description}</p>
        </div>
        {headerDate && (
          <div className="text-sm text-muted-foreground sm:text-right sm:ml-4 flex-shrink-0">
            {headerDate}
          </div>
        )}
      </div>
    </CardHeader>
    <CardContent className="pt-0">{children}</CardContent>
  </Card>
);
