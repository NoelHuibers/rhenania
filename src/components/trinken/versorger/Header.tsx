import { Plus } from "lucide-react";

import { type Drink } from "~/server/actions/drinks";

import { Button } from "~/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { DrinkRow } from "./DrinkRow";

export function Header({
  count,
  onAdd,
  isPending,
}: {
  count: number;
  onAdd: () => void;
  isPending: boolean;
}) {
  return (
    <header className="flex items-start sm:items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Getränke-Verwaltung
        </h1>
        <p className="text-muted-foreground">
          Verwalten Sie Ihre Getränkekarte, Preise und Verfügbarkeit
        </p>
        <p className="sr-only" aria-live="polite">
          {count} Getränke vorhanden
        </p>
      </div>
      <div className="hidden md:block">
        <Button
          onClick={onAdd}
          disabled={isPending}
          aria-label="Getränk hinzufügen"
        >
          <Plus className="mr-2 h-4 w-4" />
          Getränk hinzufügen
        </Button>
      </div>
    </header>
  );
}

// ------------------------------------------------------------
// Desktop Table
// ------------------------------------------------------------
function DrinksTableDesktop({
  drinks,
  editingId,
  editingData,
  setEditingData,
  startEditing,
  cancelEditing,
  saveEdit,
  onDelete,
  onToggleAvailability,
  isPending,
}: {
  drinks: Drink[];
  editingId: string | null;
  editingData: {
    name: string;
    price: string;
    volume: string;
    kastengroesse: string;
  };
  setEditingData: React.Dispatch<
    React.SetStateAction<{
      name: string;
      price: string;
      volume: string;
      kastengroesse: string;
    }>
  >;
  startEditing: (drink: Drink) => void;
  cancelEditing: () => void;
  saveEdit: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (id: string) => void;
  isPending: boolean;
}) {
  return (
    <Table aria-label="Getränke">
      <TableHeader>
        <TableRow>
          <TableHead className="w-[80px]">Bild</TableHead>
          <TableHead>Name</TableHead>
          <TableHead>Preis</TableHead>
          <TableHead>Volumen (L)</TableHead>
          <TableHead>Kastengröße</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Aktionen</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {drinks.length === 0 ? (
          <TableRow>
            <TableCell
              colSpan={7}
              className="text-center py-8 text-muted-foreground"
            >
              Noch keine Getränke hinzugefügt. Klicken Sie auf „Getränk
              hinzufügen“, um zu beginnen.
            </TableCell>
          </TableRow>
        ) : (
          drinks.map((drink) => (
            <DrinkRow
              key={drink.id}
              drink={drink}
              isEditing={editingId === drink.id}
              editingData={editingData}
              setEditingData={setEditingData}
              onStartEdit={() => startEditing(drink)}
              onCancel={cancelEditing}
              onSave={() => saveEdit(drink.id)}
              onDelete={() => onDelete(drink.id)}
              onToggleAvailability={() => onToggleAvailability(drink.id)}
              isPending={isPending}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}
