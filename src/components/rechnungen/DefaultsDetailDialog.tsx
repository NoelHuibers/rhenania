import { formatCurrency, type BillingEntry } from "~/app/rechnung/page";
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

// Default Details Dialog Component
export const DefaultDetailsDialog = ({ entry }: { entry: BillingEntry }) => (
  <Dialog>
    <DialogTrigger asChild>
      <Button variant="outline" size="sm">
        Details
      </Button>
    </DialogTrigger>
    <DialogContent className="max-w-2xl">
      <DialogHeader>
        <DialogTitle>Bestelldetails - {entry.name}</DialogTitle>
      </DialogHeader>
      <div className="space-y-4">
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
                <TableCell>{item.name}</TableCell>
                <TableCell className="text-right">{item.quantity}</TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.unitPrice)}
                </TableCell>
                <TableCell className="text-right">
                  {formatCurrency(item.subtotal)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <div className="flex justify-between items-center pt-4 border-t">
          <span className="text-lg font-semibold">Gesamt:</span>
          <span className="text-lg font-bold">
            {formatCurrency(entry.totalDue)}
          </span>
        </div>
      </div>
    </DialogContent>
  </Dialog>
);
