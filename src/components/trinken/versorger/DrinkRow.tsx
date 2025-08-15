// DrinkRow.tsx
"use client";

import { Check, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";

import { type Drink } from "~/server/actions/drinks";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { TableCell, TableRow } from "~/components/ui/table";
import { DeleteButton } from "./Deletebutton";

interface DrinkRowProps {
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
  isUploadingImage?: boolean;
  uploadProgress?: number;
}

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
  isUploadingImage = false,
  uploadProgress = 0,
}: DrinkRowProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);

  const handleImageClick = () => {
    if (!isPending && !isUploadingImage) {
      fileInputRef.current?.click();
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create preview immediately
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);

      // Call the update function
      await onImageUpdate(file);

      // Clear preview after upload completes
      // Delay to allow user to see the successful upload
      setTimeout(() => {
        setImagePreview(null);
        // Reset the input
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }, 500);
    }
  };

  return (
    <TableRow>
      <TableCell>
        <div className="relative group">
          <button
            type="button"
            onClick={handleImageClick}
            className="relative block rounded-md overflow-hidden hover:opacity-80 transition-opacity disabled:opacity-50"
            aria-label={`Bild für ${drink.name} ändern`}
            disabled={isPending || isUploadingImage}
          >
            <Image
              src={imagePreview || drink.picture || "/placeholder.svg"}
              alt={drink.name}
              width={48}
              height={48}
              className="rounded-md object-cover"
              sizes="48px"
            />
            {!isUploadingImage && (
              <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Upload className="h-4 w-4 text-white" />
              </div>
            )}
            {isUploadingImage && (
              <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                <div className="text-white text-xs font-medium">
                  {Math.round(uploadProgress)}%
                </div>
              </div>
            )}
          </button>
          {isUploadingImage && (
            <div className="absolute -bottom-1 left-0 right-0">
              <Progress value={uploadProgress} className="h-1" />
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/jpg,image/png,image/webp"
            onChange={handleFileChange}
            className="hidden"
            aria-label={`Neue Bilddatei für ${drink.name} auswählen`}
          />
        </div>
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
            disabled={isPending || isUploadingImage}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
          />
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left disabled:opacity-50"
            onClick={onStartEdit}
            aria-label={`"${drink.name}" bearbeiten`}
            disabled={isPending || isUploadingImage}
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
              disabled={isPending || isUploadingImage}
              onKeyDown={(e) => {
                if (e.key === "Enter") onSave();
                if (e.key === "Escape") onCancel();
              }}
            />
          </div>
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left disabled:opacity-50"
            onClick={onStartEdit}
            aria-label={`${drink.name} Preis bearbeiten`}
            disabled={isPending || isUploadingImage}
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
              disabled={isPending || isUploadingImage}
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
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left disabled:opacity-50"
            onClick={onStartEdit}
            aria-label={`${drink.name} Volumen bearbeiten`}
            disabled={isPending || isUploadingImage}
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
            disabled={isPending || isUploadingImage}
            onKeyDown={(e) => {
              if (e.key === "Enter") onSave();
              if (e.key === "Escape") onCancel();
            }}
          />
        ) : (
          <button
            type="button"
            className="cursor-pointer hover:bg-muted p-2 rounded w-full text-left disabled:opacity-50"
            onClick={onStartEdit}
            aria-label={`${drink.name} Kastengröße bearbeiten`}
            disabled={isPending || isUploadingImage}
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
          disabled={isPending || isUploadingImage}
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
                disabled={isPending || isUploadingImage}
                aria-label={`${drink.name} speichern`}
              >
                <Check className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onCancel}
                disabled={isPending || isUploadingImage}
                aria-label="Bearbeitung abbrechen"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          ) : (
            <DeleteButton
              onConfirm={onDelete}
              disabled={isPending || isUploadingImage}
              label={`"${drink.name}" löschen`}
            />
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
