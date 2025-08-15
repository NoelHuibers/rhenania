// DrinkRow.tsx
import { Check, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

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
  onImageUpdate,
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
  onImageUpdate: (file: File) => void;
  isPending: boolean;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create preview
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Call the update function
      await onImageUpdate(file);

      // Clear preview after successful upload
      setImagePreview(null);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <div className="relative group">
          <button
            type="button"
            onClick={handleImageClick}
            className="relative block rounded-md overflow-hidden hover:opacity-80 transition-opacity"
            aria-label={`Bild für ${drink.name} ändern`}
            disabled={isPending}
          >
            <Image
              src={imagePreview || drink.picture || "/placeholder.svg"}
              alt={drink.name}
              width={48}
              height={48}
              className="rounded-md object-cover"
              sizes="48px"
            />
            <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Upload className="h-4 w-4 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="hidden"
            aria-label={`Neue Bilddatei für ${drink.name} auswählen`}
          />
        </div>
      </TableCell>

      {/* Rest of your existing table cells remain the same */}
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
            aria-label={`"${drink.name}" bearbeiten`}
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
