// DesktopCard.tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import type { Drink } from "~/server/actions/drinks";
import { DrinkRow } from "./DrinkRow";

export function DrinksTableDesktop({
  drinks,
  editingId,
  editingData,
  setEditingData,
  startEditing,
  cancelEditing,
  saveEdit,
  onDelete,
  onToggleAvailability,
  onImageUpdate,
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
  onImageUpdate: (id: string, file: File) => void;
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
              hinzufügen", um zu beginnen.
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
              onImageUpdate={(file) => onImageUpdate(drink.id, file)}
              isPending={isPending}
            />
          ))
        )}
      </TableBody>
    </Table>
  );
}
