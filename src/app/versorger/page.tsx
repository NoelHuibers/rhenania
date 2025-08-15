"use client";

import { Plus } from "lucide-react";
import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";

import { AddDrinkDialog } from "~/components/trinken/AddDrinkDialog";
import {
  deleteDrink,
  getDrinks,
  toggleDrinkAvailability,
  updateDrink,
  type Drink,
} from "~/server/actions/drinks";

import { DrinksTableDesktop } from "~/components/trinken/versorger/DesktopCard";
import { Header } from "~/components/trinken/versorger/Header";
import { DrinksCardsMobile } from "~/components/trinken/versorger/MobileCard";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { uploadDrinkImage, validateImageFile } from "~/lib/blob-upload";

export default function DrinksAdmin() {
  const [drinks, setDrinks] = useState<Drink[]>([]);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<{
    name: string;
    price: string;
    volume: string;
    kastengroesse: string;
  }>({ name: "", price: "", volume: "", kastengroesse: "" });
  const [isPending, startTransition] = useTransition();
  const [isLoading, setIsLoading] = useState(true);
  const [uploadingImage, setUploadingImage] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number>(0);

  useEffect(() => {
    loadDrinks();
  }, []);

  const loadDrinks = async () => {
    try {
      setIsLoading(true);
      const fetchedDrinks = await getDrinks();
      setDrinks(fetchedDrinks);
    } catch (error) {
      console.error("Error loading drinks:", error);
      toast.error("Fehler beim Laden der Getränke");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteDrink = (id: string) => {
    startTransition(async () => {
      try {
        const result = await deleteDrink(id);
        if (result.success) {
          toast.success(result.message);
          setDrinks((prev) => prev.filter((drink) => drink.id !== id));
        } else {
          toast.error(result.error || "Fehler beim Löschen");
        }
      } catch (error) {
        console.error("Error deleting drink:", error);
        toast.error("Ein unerwarteter Fehler ist aufgetreten");
      }
    });
  };

  const handleToggleAvailability = (id: string) => {
    startTransition(async () => {
      try {
        const result = await toggleDrinkAvailability(id);
        if (result.success) {
          toast.success(result.message);
          setDrinks((prev) =>
            prev.map((drink) =>
              drink.id === id
                ? {
                    ...drink,
                    isCurrentlyAvailable: !drink.isCurrentlyAvailable,
                  }
                : drink
            )
          );
        } else {
          toast.error(result.error || "Fehler beim Ändern der Verfügbarkeit");
        }
      } catch (error) {
        console.error("Error toggling availability:", error);
        toast.error("Ein unerwarteter Fehler ist aufgetreten");
      }
    });
  };

  const handleImageUpdate = async (drinkId: string, file: File) => {
    try {
      // Validate file
      validateImageFile(file);

      // Set uploading state
      setUploadingImage(drinkId);
      setUploadProgress(0);

      // Upload image to Vercel Blob from client side
      const pictureUrl = await uploadDrinkImage(file, {
        onProgress: (progress) => {
          setUploadProgress(progress);
        },
      });

      // Update drink with new image URL
      startTransition(async () => {
        try {
          const result = await updateDrink(drinkId, { pictureUrl });

          if (result.success && result.data) {
            toast.success("Bild erfolgreich aktualisiert");

            // Update local state with new drink data
            setDrinks((prev) =>
              prev.map((drink) => (drink.id === drinkId ? result.data! : drink))
            );
          } else {
            toast.error(result.error || "Fehler beim Aktualisieren des Bildes");
          }
        } catch (error) {
          console.error("Error updating drink with image:", error);
          toast.error("Ein unerwarteter Fehler ist aufgetreten");
        } finally {
          setUploadingImage(null);
          setUploadProgress(0);
        }
      });
    } catch (error) {
      console.error("Error uploading image:", error);
      toast.error(
        error instanceof Error
          ? error.message
          : "Fehler beim Hochladen des Bildes"
      );
      setUploadingImage(null);
      setUploadProgress(0);
    }
  };

  const startEditing = (drink: Drink) => {
    setEditingId(drink.id);
    setEditingData({
      name: drink.name,
      price: drink.price.toString(),
      volume: drink.volume?.toString() || "",
      kastengroesse: drink.kastengroesse?.toString() || "",
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditingData({ name: "", price: "", volume: "", kastengroesse: "" });
  };

  const saveEdit = (id: string) => {
    const price = parseFloat(editingData.price);
    const volume = editingData.volume
      ? parseFloat(editingData.volume)
      : undefined;
    const kastengroesse = editingData.kastengroesse
      ? parseInt(editingData.kastengroesse)
      : undefined;

    if (!editingData.name.trim()) {
      toast.error("Name ist erforderlich");
      return;
    }
    if (isNaN(price) || price <= 0) {
      toast.error("Gültiger Preis ist erforderlich");
      return;
    }
    if (editingData.volume && (isNaN(volume!) || volume! <= 0)) {
      toast.error("Gültiges Volumen ist erforderlich");
      return;
    }
    if (
      editingData.kastengroesse &&
      (isNaN(kastengroesse!) ||
        kastengroesse! <= 0 ||
        !Number.isInteger(kastengroesse!))
    ) {
      toast.error("Gültige Kastengröße (ganze Zahl) ist erforderlich");
      return;
    }

    startTransition(async () => {
      try {
        const updateData: any = { name: editingData.name.trim(), price };
        if (volume !== undefined) updateData.volume = volume;
        if (kastengroesse !== undefined)
          updateData.kastengroesse = kastengroesse;

        const result = await updateDrink(id, updateData);
        if (result.success) {
          toast.success(result.message);
          setDrinks((prev) =>
            prev.map((drink) =>
              drink.id === id
                ? {
                    ...drink,
                    name: editingData.name.trim(),
                    price,
                    volume: volume ?? null,
                    kastengroesse: kastengroesse ?? null,
                  }
                : drink
            )
          );
          cancelEditing();
        } else {
          toast.error(result.error || "Fehler beim Aktualisieren");
        }
      } catch (error) {
        console.error("Error updating drink:", error);
        toast.error("Ein unerwarteter Fehler ist aufgetreten");
      }
    });
  };

  const handleDrinkAdded = () => {
    loadDrinks();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6" role="status" aria-live="polite">
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">Getränke werden geladen…</div>
        </div>
      </div>
    );
  }

  return (
    <main
      className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6"
      aria-busy={isPending}
    >
      <Header
        count={drinks.length}
        onAdd={() => setIsAddDialogOpen(true)}
        isPending={isPending}
      />

      <AddDrinkDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onDrinkAdded={handleDrinkAdded}
      />

      <Card>
        <section>
          <CardHeader>
            <CardTitle>Getränkekarte</CardTitle>
            <CardDescription aria-live="polite">
              {drinks.length} Getränke in Ihrer Karte
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Desktop Table */}
            <div
              className="hidden md:block rounded-md border"
              role="region"
              aria-label="Getränke Tabelle"
            >
              <DrinksTableDesktop
                drinks={drinks}
                editingId={editingId}
                editingData={editingData}
                setEditingData={setEditingData}
                startEditing={startEditing}
                cancelEditing={cancelEditing}
                saveEdit={saveEdit}
                onDelete={handleDeleteDrink}
                onToggleAvailability={handleToggleAvailability}
                onImageUpdate={handleImageUpdate}
                isPending={isPending}
                uploadingImage={uploadingImage}
                uploadProgress={uploadProgress}
              />
            </div>

            {/* Mobile Cards */}
            <div
              className="md:hidden"
              role="region"
              aria-label="Getränke Liste mobil"
            >
              <DrinksCardsMobile
                drinks={drinks}
                editingId={editingId}
                editingData={editingData}
                setEditingData={setEditingData}
                startEditing={startEditing}
                cancelEditing={cancelEditing}
                saveEdit={saveEdit}
                onDelete={handleDeleteDrink}
                onToggleAvailability={handleToggleAvailability}
                onImageUpdate={handleImageUpdate}
                isPending={isPending}
                uploadingImage={uploadingImage}
                uploadProgress={uploadProgress}
              />
            </div>
          </CardContent>
        </section>
      </Card>

      {/* Floating Add Button for mobile */}
      <div className="md:hidden fixed bottom-6 right-6 z-50">
        <Button
          onClick={() => setIsAddDialogOpen(true)}
          size="lg"
          aria-label="Neues Getränk hinzufügen"
          disabled={isPending}
          className="rounded-full shadow-lg h-12 w-12 p-0"
        >
          <Plus className="h-6 w-6" />
        </Button>
      </div>
    </main>
  );
}
