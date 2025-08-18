// DefaultDetailDialog.tsx
import { type BillingEntry } from "~/app/rechnung/page";
import { Button } from "../ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../ui/table";
import { formatCurrency } from "./BillingTable";

export const DefaultDetailsDialog = ({ entry }: { entry: BillingEntry }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm">
        Details
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-2xl max-h-[90vh] mx-4 sm:mx-0 flex flex-col">
      <DialogHeader className="flex-shrink-0">
        <DialogTitle className="text-base sm:text-lg break-words">
          Bestelldetails - {entry.name}
        </DialogTitle>
      </DialogHeader>
      <div className="space-y-4 overflow-y-auto flex-1 min-h-0">
        {/* Desktop Table View */}
        <div className="hidden sm:block">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Artikel</TableHead>
                <TableHead className="text-right">Anzahl</TableHead>
                <TableHead className="text-right">Einzelpreis</TableHead>
                <TableHead className="text-right">Zwischensumme</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entry.items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-medium">{item.name}</TableCell>
                  <TableCell className="text-right">{item.quantity}</TableCell>
                  <TableCell className="text-right">
                    {formatCurrency(item.unitPrice)}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {formatCurrency(item.subtotal)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        {/* Mobile Card View */}
        <div className="sm:hidden space-y-3">
          {entry.items.map((item) => (
            <div key={item.id} className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="font-medium text-sm break-words">{item.name}</div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Anzahl:</span>
                  <span>{item.quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Einzelpreis:</span>
                  <span>{formatCurrency(item.unitPrice)}</span>
                </div>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-gray-200">
                <span className="text-gray-600 text-sm">Zwischensumme:</span>
                <span className="font-semibold">
                  {formatCurrency(item.subtotal)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="flex justify-between items-center pt-4 border-t">
          <span className="text-base sm:text-lg font-semibold">Gesamt:</span>
          <span className="text-base sm:text-lg font-bold">
            {formatCurrency(entry.totalDue)}
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
