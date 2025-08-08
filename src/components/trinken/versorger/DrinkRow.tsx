import { Check, X } from "lucide-react";
import Image from "next/image";

import { type Drink } from "~/server/actions/drinks";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { TableCell, TableRow } from "~/components/ui/table";
import { DeleteButton } from "./Deletebutton";

export function DrinkRow({
  drink,
  isEditing,
  editingData,
  setEditingData,
  onStartEdit,
  onCancel,
  onSave,
  onDelete,
  onToggleAvailability,
  isPending,
}: {
  drink: Drink;
  isEditing: boolean;
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
  onStartEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  onDelete: () => void;
  onToggleAvailability: () => void;
  isPending: boolean;
}) {
  return (
    <TableRow>
      <TableCell>
        <Image
          src={drink.picture || "/placeholder.svg"}
          alt={drink.name}
          width={48}
          height={48}
          className="rounded-md object-cover"
          sizes="48px"
        />
      </TableCell>

      <TableCell className="font-medium">
        {isEditing ? (
          <Input
            aria-label="Name"
            value={editingData.name}
            onChange={(e) =>
              setEditingData((prev) => ({ ...prev, name: e.target.value }))
            }
            className="w-full"
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
          />
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left"
            onClick={onStartEdit}
            aria-label={`\"${drink.name}\" bearbeiten`}
          >
            {drink.name}
          </button>
        )}
      </TableCell>

      <TableCell>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <span className="sr-only">Euro</span>
            <Input
              aria-label="Preis in Euro"
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              value={editingData.price}
              onChange={(e) =>
                setEditingData((prev) => ({ ...prev, price: e.target.value }))
              }
              className="w-24"
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left"
            onClick={onStartEdit}
            aria-label={`${drink.name} Preis bearbeiten`}
          >
            €{drink.price.toFixed(2)}
          </button>
        )}
      </TableCell>

      <TableCell>
        {isEditing ? (
          <div className="flex items-center gap-1">
            <Input
              aria-label="Volumen in Litern"
              inputMode="decimal"
              type="number"
              step="0.01"
              min="0"
              value={editingData.volume}
              onChange={(e) =>
                setEditingData((prev) => ({ ...prev, volume: e.target.value }))
              }
              className="w-24"
              placeholder="Leer"
              disabled={isPending}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onCancel();
              }}
            />
            <span className="text-sm text-muted-foreground" aria-hidden>
              L
            </span>
          </div>
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left"
            onClick={onStartEdit}
            aria-label={`${drink.name} Volumen bearbeiten`}
          >
            {drink.volume ? `${drink.volume}L` : "-"}
          </button>
        )}
      </TableCell>

      <TableCell>
        {isEditing ? (
          <Input
            aria-label="Kastengröße (ganze Zahl)"
            inputMode="numeric"
            type="number"
            step="1"
            min="0"
            value={editingData.kastengroesse}
            onChange={(e) =>
              setEditingData((prev) => ({
                ...prev,
                kastengroesse: e.target.value,
              }))
            }
            className="w-24"
            placeholder="Leer"
            disabled={isPending}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
          />
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left"
            onClick={onStartEdit}
            aria-label={`${drink.name} Kastengröße bearbeiten`}
          >
            {drink.kastengroesse ? drink.kastengroesse : "-"}
          </button>
        )}
      </TableCell>

      <TableCell>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleAvailability}
          disabled={isPending}
          className="cursor-pointer"
          aria-label={
            drink.isCurrentlyAvailable
              ? `${drink.name} auf nicht verfügbar setzen`
              : `${drink.name} auf verfügbar setzen`
          }
        >
          <Badge variant={drink.isCurrentlyAvailable ? "default" : "secondary"}>
            {drink.isCurrentlyAvailable ? "Verfügbar" : "Nicht verfügbar"}
          </Badge>
        </Button>
      </TableCell>

      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1 sm:gap-2">
          {isEditing ? (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={onSave}
                disabled={isPending}
                aria-label={`${drink.name} speichern`}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={isPending}
                aria-label="Bearbeitung abbrechen"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <DeleteButton
              onConfirm={onDelete}
              disabled={isPending}
              label={`\"${drink.name}\" löschen`}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
