// MobileCard.tsx
"use client";

import { Check, Upload, X } from "lucide-react";
import Image from "next/image";
import { useRef, useState } from "react";
import { type Drink } from "~/server/actions/drinks";

import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Progress } from "~/components/ui/progress";
import { DeleteButton } from "./Deletebutton";

interface DrinksCardsMobileProps {
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
  uploadingImage?: string | null;
  uploadProgress?: number;
}

export function DrinksCardsMobile({
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
  uploadingImage,
  uploadProgress = 0,
}: DrinksCardsMobileProps) {
  // Add file input refs for each card
  const fileInputRefs = useRef<{ [key: string]: HTMLInputElement | null }>({});
  const [imagePreviews, setImagePreviews] = useState<{ [key: string]: string }>(
    {}
  );

  const handleImageClick = (drinkId: string) => {
    if (!isPending && uploadingImage !== drinkId) {
      fileInputRefs.current[drinkId]?.click();
    }
  };

  const handleFileChange = async (
    drinkId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      // Create preview immediately
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreviews((prev) => ({
          ...prev,
          [drinkId]: reader.result as string,
        }));
      };
      reader.readAsDataURL(file);

      // Call the update function
      await onImageUpdate(drinkId, file);

      // Clear preview after upload completes
      // This will be handled by the parent component after successful upload
      setTimeout(() => {
        setImagePreviews((prev) => {
          const newPreviews = { ...prev };
          delete newPreviews[drinkId];
          return newPreviews;
        });
        // Reset the input
        if (fileInputRefs.current[drinkId]) {
          fileInputRefs.current[drinkId]!.value = "";
        }
      }, 500);
    }
  };

  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {drinks.map((drink) => {
        const isEditingThis = editingId === drink.id;
        const isUploadingThis = uploadingImage === drink.id;

        return (
          <li key={drink.id} className="rounded-lg border p-3">
            <div className="flex items-center gap-3">
              <div className="relative h-14 w-14 shrink-0 group">
                <button
                  type="button"
                  onClick={() => handleImageClick(drink.id)}
                  className="relative block w-full h-full rounded-md overflow-hidden hover:opacity-80 transition-opacity disabled:opacity-50"
                  aria-label={`Bild für ${drink.name} ändern`}
                  disabled={isPending || isUploadingThis}
                >
                  <Image
                    src={
                      imagePreviews[drink.id] ||
                      drink.picture ||
                      "/placeholder.svg"
                    }
                    alt={drink.name}
                    fill
                    className="rounded-md object-cover"
                    sizes="56px"
                  />
                  {!isUploadingThis && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                      <Upload className="h-3 w-3 text-white" />
                    </div>
                  )}
                  {isUploadingThis && (
                    <div className="absolute inset-0 bg-black bg-opacity-70 flex items-center justify-center">
                      <div className="text-white text-xs">
                        {Math.round(uploadProgress)}%
                      </div>
                    </div>
                  )}
                </button>
                <input
                  ref={(el) => {
                    fileInputRefs.current[drink.id] = el;
                  }}
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp"
                  onChange={(e) => handleFileChange(drink.id, e)}
                  className="hidden"
                  aria-label={`Neue Bilddatei für ${drink.name} auswählen`}
                />
              </div>
              <div className="flex-1 min-w-0">
                {isEditingThis ? (
                  <Input
                    aria-label="Name"
                    value={editingData.name}
                    onChange={(e) =>
                      setEditingData((p) => ({ ...p, name: e.target.value }))
                    }
                    disabled={isPending}
                    className="h-8"
                  />
                ) : (
                  <div className="font-medium truncate">{drink.name}</div>
                )}
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>
                    Preis:{" "}
                    {isEditingThis ? (
                      <Input
                        aria-label="Preis in Euro"
                        inputMode="decimal"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingData.price}
                        onChange={(e) =>
                          setEditingData((p) => ({
                            ...p,
                            price: e.target.value,
                          }))
                        }
                        className="h-6 w-20 inline-block"
                        disabled={isPending}
                      />
                    ) : (
                      <>€{drink.price.toFixed(2)}</>
                    )}
                  </span>
                  <span className="inline-block">•</span>
                  <span>
                    Vol:{" "}
                    {isEditingThis ? (
                      <Input
                        aria-label="Volumen in Litern"
                        inputMode="decimal"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editingData.volume}
                        onChange={(e) =>
                          setEditingData((p) => ({
                            ...p,
                            volume: e.target.value,
                          }))
                        }
                        className="h-6 w-16 inline-block"
                        placeholder="-"
                        disabled={isPending}
                      />
                    ) : (
                      <>{drink.volume ? `${drink.volume}L` : "-"}</>
                    )}
                  </span>
                  <span className="inline-block">•</span>
                  <span>
                    Kasten:{" "}
                    {isEditingThis ? (
                      <Input
                        aria-label="Kastengröße (ganze Zahl)"
                        inputMode="numeric"
                        type="number"
                        step="1"
                        min="0"
                        value={editingData.kastengroesse}
                        onChange={(e) =>
                          setEditingData((p) => ({
                            ...p,
                            kastengroesse: e.target.value,
                          }))
                        }
                        className="h-6 w-16 inline-block"
                        placeholder="-"
                        disabled={isPending}
                      />
                    ) : (
                      <>{drink.kastengroesse ?? "-"}</>
                    )}
                  </span>
                </div>
              </div>
            </div>

            {/* Upload progress bar */}
            {isUploadingThis && (
              <div className="mt-2">
                <Progress value={uploadProgress} className="h-1" />
                <p className="text-xs text-muted-foreground mt-1">
                  Bild wird hochgeladen...
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="mt-3 flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onToggleAvailability(drink.id)}
                disabled={isPending || isUploadingThis}
                aria-label={
                  drink.isCurrentlyAvailable
                    ? `${drink.name} auf nicht verfügbar setzen`
                    : `${drink.name} auf verfügbar setzen`
                }
                className="cursor-pointer p-0"
              >
                <Badge
                  variant={drink.isCurrentlyAvailable ? "default" : "secondary"}
                  className="cursor-pointer"
                >
                  {drink.isCurrentlyAvailable ? "Verfügbar" : "Nicht verfügbar"}
                </Badge>
              </Button>

              <div className="flex items-center gap-2">
                {isEditingThis ? (
                  <>
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => saveEdit(drink.id)}
                      disabled={isPending}
                      aria-label={`${drink.name} speichern`}
                    >
                      <Check className="h-4 w-4" />
                      <span className="ml-1 hidden sm:inline">Speichern</span>
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={cancelEditing}
                      disabled={isPending}
                      aria-label="Bearbeitung abbrechen"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => startEditing(drink)}
                      disabled={isPending || isUploadingThis}
                      aria-label={`${drink.name} bearbeiten`}
                    >
                      Bearbeiten
                    </Button>
                    <DeleteButton
                      onConfirm={() => onDelete(drink.id)}
                      disabled={isPending || isUploadingThis}
                      label={`"${drink.name}" löschen`}
                    />
                  </>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
