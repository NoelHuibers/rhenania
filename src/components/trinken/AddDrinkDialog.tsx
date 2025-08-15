// components/trinken/AddDrinkDialog.tsx
"use client";

import { Upload, X } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { uploadDrinkImage, validateImageFile } from "~/lib/blob-upload";
import { addDrink } from "~/server/actions/drinks";

import { Button } from "~/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "~/components/ui/select";

interface AddDrinkDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDrinkAdded: () => void;
}

export function AddDrinkDialog({
  isOpen,
  onOpenChange,
  onDrinkAdded,
}: AddDrinkDialogProps) {
  const [isPending, startTransition] = useTransition();
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    volume: "",
    kastengroesse: "",
    isCurrentlyAvailable: "true",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      volume: "",
      kastengroesse: "",
      isCurrentlyAvailable: "true",
    });
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setUploadProgress(0);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      validateImageFile(file);
      setSelectedFile(file);

      // Create preview URL
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Fehler bei der Dateiauswahl"
      );
    }
  };

  const removeFile = () => {
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    // Reset file input
    const fileInput = document.getElementById("picture") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate required fields
    if (!formData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }

    const price = parseFloat(formData.price);
    if (isNaN(price) || price <= 0) {
      toast.error("Gültiger Preis ist erforderlich");
      return;
    }

    const volume = formData.volume ? parseFloat(formData.volume) : undefined;
    if (formData.volume && (isNaN(volume!) || volume! <= 0)) {
      toast.error("Gültiges Volumen ist erforderlich");
      return;
    }

    const kastengroesse = formData.kastengroesse
      ? parseInt(formData.kastengroesse)
      : undefined;
    if (
      formData.kastengroesse &&
      (isNaN(kastengroesse!) ||
        kastengroesse! <= 0 ||
        !Number.isInteger(kastengroesse!))
    ) {
      toast.error("Gültige Kastengröße (ganze Zahl) ist erforderlich");
      return;
    }

    try {
      let pictureUrl: string | undefined;

      // Upload image first if selected
      if (selectedFile) {
        setIsUploading(true);
        setUploadProgress(0);

        try {
          pictureUrl = await uploadDrinkImage(selectedFile, {
            onProgress: (progress) => {
              setUploadProgress(progress);
            },
          });
        } catch (uploadError) {
          console.error("Error uploading image:", uploadError);
          toast.error(
            uploadError instanceof Error
              ? uploadError.message
              : "Fehler beim Hochladen des Bildes"
          );
          setIsUploading(false);
          setUploadProgress(0);
          return;
        }

        setIsUploading(false);
      }

      // Now save the drink with the image URL
      startTransition(async () => {
        try {
          const result = await addDrink({
            name: formData.name.trim(),
            price,
            volume,
            kastengroesse,
            pictureUrl,
            isCurrentlyAvailable: formData.isCurrentlyAvailable === "true",
          });

          if (result.success) {
            toast.success(result.message);
            onDrinkAdded();
            onOpenChange(false);
            resetForm();
          } else {
            toast.error(result.error || "Fehler beim Hinzufügen des Getränks");
            if (result.details) {
              result.details.forEach((error: any) => {
                toast.error(`${error.path.join(".")}: ${error.message}`);
              });
            }
          }
        } catch (error) {
          console.error("Error adding drink:", error);
          toast.error("Ein unerwarteter Fehler ist aufgetreten");
        }
      });
    } catch (error) {
      console.error("Error in form submission:", error);
      toast.error("Ein unerwarteter Fehler ist aufgetreten");
    }
  };

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const isSubmitting = isPending || isUploading;
  const isFormValid =
    formData.name.trim() && formData.price && parseFloat(formData.price) > 0;

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) {
          resetForm();
        }
        onOpenChange(open);
      }}
    >
      <DialogContent className="sm:max-w-[500px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <DialogTitle>Neues Getränk hinzufügen</DialogTitle>
            <DialogDescription>
              Fügen Sie ein neues Getränk zu Ihrer Karte hinzu. Füllen Sie alle
              Details unten aus.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => handleInputChange("name", e.target.value)}
                placeholder="Getränkename eingeben"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="price">Preis (€) *</Label>
              <Input
                id="price"
                type="number"
                step="0.01"
                min="0"
                value={formData.price}
                onChange={(e) => handleInputChange("price", e.target.value)}
                placeholder="0.00"
                required
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="volume">Volumen (Liter)</Label>
              <Input
                id="volume"
                type="number"
                step="0.01"
                min="0"
                value={formData.volume}
                onChange={(e) => handleInputChange("volume", e.target.value)}
                placeholder="0.33"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="kastengroesse">Kastengröße</Label>
              <Input
                id="kastengroesse"
                type="number"
                step="1"
                min="0"
                value={formData.kastengroesse}
                onChange={(e) =>
                  handleInputChange("kastengroesse", e.target.value)
                }
                placeholder="z.B. 20"
                disabled={isSubmitting}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="picture">Bild (optional)</Label>
              {!selectedFile ? (
                <div className="flex items-center gap-2">
                  <Input
                    id="picture"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileSelect}
                    disabled={isSubmitting}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("picture")?.click()}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Bild auswählen
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 p-2 border rounded-md">
                    {previewUrl && (
                      <Image
                        src={previewUrl}
                        alt="Vorschau"
                        width={64}
                        height={64}
                        className="rounded-md object-cover"
                      />
                    )}
                    <div className="flex-1">
                      <p className="text-sm font-medium">{selectedFile.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={removeFile}
                      disabled={isSubmitting}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => document.getElementById("picture")?.click()}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    <Upload className="mr-2 h-4 w-4" />
                    Anderes Bild wählen
                  </Button>
                  <Input
                    id="picture"
                    type="file"
                    accept="image/jpeg,image/jpg,image/png,image/webp"
                    onChange={handleFileSelect}
                    disabled={isSubmitting}
                    className="hidden"
                  />
                </div>
              )}
              {isUploading && (
                <div className="space-y-2">
                  <Progress value={uploadProgress} />
                  <p className="text-sm text-muted-foreground">
                    Bild wird hochgeladen... {Math.round(uploadProgress)}%
                  </p>
                </div>
              )}
            </div>

            <div className="grid gap-2">
              <Label htmlFor="availability">Derzeit verfügbar</Label>
              <Select
                value={formData.isCurrentlyAvailable}
                onValueChange={(value) =>
                  handleInputChange("isCurrentlyAvailable", value)
                }
                disabled={isSubmitting}
              >
                <SelectTrigger id="availability">
                  <SelectValue placeholder="Verfügbarkeit auswählen" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">Verfügbar</SelectItem>
                  <SelectItem value="false">Nicht verfügbar</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Abbrechen
            </Button>
            <Button type="submit" disabled={!isFormValid || isSubmitting}>
              {isSubmitting ? (
                <>
                  {isUploading
                    ? "Bild wird hochgeladen..."
                    : "Wird hinzugefügt..."}
                </>
              ) : (
                "Getränk hinzufügen"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
