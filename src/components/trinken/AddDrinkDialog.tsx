"use client";

import { Upload, X } from "lucide-react";
import Image from "next/image";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { addDrink } from "~/server/actions/drinks";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../ui/select";

interface AddDrinkDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  onDrinkAdded?: () => void;
}

export function AddDrinkDialog({
  isOpen,
  onOpenChange,
  onDrinkAdded,
}: AddDrinkDialogProps) {
  const [formData, setFormData] = useState({
    name: "",
    price: "",
    isCurrentlyAvailable: "true",
  });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [isPending, startTransition] = useTransition();

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast.error("Bild ist zu groß. Maximale Größe: 5MB");
        return;
      }

      // Check file type
      if (!file.type.startsWith("image/")) {
        toast.error("Bitte wählen Sie eine Bilddatei aus");
        return;
      }

      setSelectedFile(file);

      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    setSelectedFile(null);
    setImagePreview("");
    // Reset file input
    const fileInput = document.getElementById("picture") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const resetForm = () => {
    setFormData({
      name: "",
      price: "",
      isCurrentlyAvailable: "true",
    });
    setSelectedFile(null);
    setImagePreview("");
    // Reset file input
    const fileInput = document.getElementById("picture") as HTMLInputElement;
    if (fileInput) fileInput.value = "";
  };

  const handleSubmit = () => {
    // Client-side validation
    if (!formData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }

    if (!formData.price || parseFloat(formData.price) <= 0) {
      toast.error("Gültiger Preis ist erforderlich");
      return;
    }

    startTransition(async () => {
      try {
        // Create FormData for file upload
        const submitFormData = new FormData();
        submitFormData.append("name", formData.name.trim());
        submitFormData.append("price", formData.price);
        submitFormData.append(
          "isCurrentlyAvailable",
          formData.isCurrentlyAvailable
        );

        if (selectedFile) {
          submitFormData.append("picture", selectedFile);
        }

        const result = await addDrink(submitFormData);

        if (result.success) {
          toast.success(result.message);
          resetForm();
          onOpenChange(false);
          onDrinkAdded?.();
        } else {
          toast.error(result.error || "Unbekannter Fehler");

          if (result.details) {
            result.details.forEach((error) => {
              toast.error(`${error.path.join(".")}: ${error.message}`);
            });
          }
        }
      } catch (error) {
        console.error("Error adding drink:", error);
        toast.error("Ein unerwarteter Fehler ist aufgetreten");
      }
    });
  };

  const handleCancel = () => {
    resetForm();
    onOpenChange(false);
  };

  const isFormValid =
    formData.name.trim() && formData.price && parseFloat(formData.price) > 0;

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Neues Getränk hinzufügen</DialogTitle>
          <DialogDescription>
            Fügen Sie ein neues Getränk zu Ihrer Karte hinzu. Füllen Sie alle
            Details unten aus.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => handleInputChange("name", e.target.value)}
              placeholder="Getränkename eingeben"
              disabled={isPending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="price">Preis (€)</Label>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0"
              value={formData.price}
              onChange={(e) => handleInputChange("price", e.target.value)}
              placeholder="0,00"
              disabled={isPending}
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="picture">Bild (optional)</Label>
            <div className="flex items-center gap-2">
              <Input
                id="picture"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
                className="hidden"
                disabled={isPending}
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => document.getElementById("picture")?.click()}
                className="w-full"
                disabled={isPending}
              >
                <Upload className="mr-2 h-4 w-4" />
                {selectedFile ? "Anderes Bild wählen" : "Bild hochladen"}
              </Button>
            </div>
            {imagePreview && (
              <div className="mt-2 flex items-center gap-2 p-2 border rounded-md">
                <Image
                  src={imagePreview}
                  alt="Vorschau"
                  width={64}
                  height={64}
                  className="rounded-md object-cover"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{selectedFile?.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {selectedFile &&
                      (selectedFile.size / 1024 / 1024).toFixed(2)}{" "}
                    MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={removeImage}
                  disabled={isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
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
              disabled={isPending}
            >
              <SelectTrigger>
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
            onClick={handleCancel}
            disabled={isPending}
          >
            Abbrechen
          </Button>
          <Button onClick={handleSubmit} disabled={!isFormValid || isPending}>
            {isPending ? "Wird hinzugefügt..." : "Getränk hinzufügen"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
