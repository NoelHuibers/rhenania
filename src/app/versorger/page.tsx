"use client";

import { Check, Plus, Trash2, X } from "lucide-react";
import Image from "next/image";
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

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "~/components/ui/alert-dialog";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Input } from "~/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";

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

  // Load drinks on component mount
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
          // Update local state immediately
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
          // Update local state immediately
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
        const updateData: any = {
          name: editingData.name.trim(),
          price: price,
        };

        if (volume !== undefined) {
          updateData.volume = volume;
        }

        if (kastengroesse !== undefined) {
          updateData.kastengroesse = kastengroesse;
        }

        const result = await updateDrink(id, updateData);

        if (result.success) {
          toast.success(result.message);
          // Update local state immediately
          setDrinks((prev) =>
            prev.map((drink) =>
              drink.id === id
                ? {
                    ...drink,
                    name: editingData.name.trim(),
                    price: price,
                    volume: volume || null,
                    kastengroesse: kastengroesse || null,
                  }
                : drink
            )
          );
          setEditingId(null);
          setEditingData({
            name: "",
            price: "",
            volume: "",
            kastengroesse: "",
          });
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
    // Refresh the drinks list when a new drink is added
    loadDrinks();
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center py-8">
          <div className="text-muted-foreground">
            Getränke werden geladen...
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">
            Getränke-Verwaltung
          </h1>
          <p className="text-muted-foreground">
            Verwalten Sie Ihre Getränkekarte, Preise und Verfügbarkeit
          </p>
        </div>
        <div>
          <Button onClick={() => setIsAddDialogOpen(true)} disabled={isPending}>
            <Plus className="mr-2 h-4 w-4" />
            Getränk hinzufügen
          </Button>
        </div>
      </div>

      <AddDrinkDialog
        isOpen={isAddDialogOpen}
        onOpenChange={setIsAddDialogOpen}
        onDrinkAdded={handleDrinkAdded}
      />

      <Card>
        <CardHeader>
          <CardTitle>Getränkekarte</CardTitle>
          <CardDescription>
            {drinks.length} Getränke in Ihrer Karte
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border">
            <Table>
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
                      Noch keine Getränke hinzugefügt. Klicken Sie auf "Getränk
                      hinzufügen" um zu beginnen.
                    </TableCell>
                  </TableRow>
                ) : (
                  drinks.map((drink) => (
                    <TableRow key={drink.id}>
                      <TableCell>
                        <Image
                          src={drink.picture || "/placeholder.svg"}
                          alt={drink.name}
                          width={48}
                          height={48}
                          className="rounded-md object-cover"
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {editingId === drink.id ? (
                          <Input
                            value={editingData.name}
                            onChange={(e) =>
                              setEditingData((prev) => ({
                                ...prev,
                                name: e.target.value,
                              }))
                            }
                            className="w-full"
                            disabled={isPending}
                          />
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-muted p-2 rounded"
                            onClick={() => startEditing(drink)}
                          >
                            {drink.name}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === drink.id ? (
                          <div className="flex items-center gap-1">
                            <span>€</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingData.price}
                              onChange={(e) =>
                                setEditingData((prev) => ({
                                  ...prev,
                                  price: e.target.value,
                                }))
                              }
                              className="w-20"
                              disabled={isPending}
                            />
                          </div>
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-muted p-2 rounded"
                            onClick={() => startEditing(drink)}
                          >
                            €{drink.price.toFixed(2)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === drink.id ? (
                          <div className="flex items-center gap-1">
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editingData.volume}
                              onChange={(e) =>
                                setEditingData((prev) => ({
                                  ...prev,
                                  volume: e.target.value,
                                }))
                              }
                              className="w-20"
                              placeholder="Leer"
                              disabled={isPending}
                            />
                            <span className="text-sm text-muted-foreground">
                              L
                            </span>
                          </div>
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-muted p-2 rounded"
                            onClick={() => startEditing(drink)}
                          >
                            {drink.volume ? `${drink.volume}L` : "-"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingId === drink.id ? (
                          <Input
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
                            className="w-20"
                            placeholder="Leer"
                            disabled={isPending}
                          />
                        ) : (
                          <div
                            className="cursor-pointer hover:bg-muted p-2 rounded"
                            onClick={() => startEditing(drink)}
                          >
                            {drink.kastengroesse ? drink.kastengroesse : "-"}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleToggleAvailability(drink.id)}
                          disabled={isPending}
                        >
                          <Badge
                            variant={
                              drink.isCurrentlyAvailable
                                ? "default"
                                : "secondary"
                            }
                          >
                            {drink.isCurrentlyAvailable
                              ? "Verfügbar"
                              : "Nicht verfügbar"}
                          </Badge>
                        </Button>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          {editingId === drink.id ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => saveEdit(drink.id)}
                                disabled={isPending}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={cancelEditing}
                                disabled={isPending}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={isPending}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>
                                    Sind Sie sicher?
                                  </AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Diese Aktion kann nicht rückgängig gemacht
                                    werden. Das Getränk "{drink.name}" wird
                                    dauerhaft aus Ihrer Karte entfernt.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>
                                    Abbrechen
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleDeleteDrink(drink.id)}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                    disabled={isPending}
                                  >
                                    {isPending ? "Wird gelöscht..." : "Löschen"}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
