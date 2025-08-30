"use client";

import {
  Check,
  Eye,
  ImageIcon,
  Loader2,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import type React from "react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Label } from "~/components/ui/label";
import { Progress } from "~/components/ui/progress";
import { Switch } from "~/components/ui/switch";
import { uploadHomepageImage, validateImageFile } from "~/lib/image-upload";
import {
  deleteHomepageImage,
  getAllHomepageImages,
  saveHomepageImage,
  toggleImageActive,
  type HomepageSection,
} from "~/server/actions/bilder/homepageImages";

interface ImageItem {
  id: string;
  imageUrl: string;
  imageName: string;
  section: HomepageSection;
  isActive: boolean;
  displayOrder: number;
  createdAt: Date;
}

export default function AdminImageManager() {
  const [images, setImages] = useState<Record<HomepageSection, ImageItem[]>>({
    header: [],
    aktive: [],
    haus: [],
    footer: [],
  });
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState<HomepageSection | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const headerInputRef = useRef<HTMLInputElement>(null);
  const aktivenInputRef = useRef<HTMLInputElement>(null);
  const hausInputRef = useRef<HTMLInputElement>(null);
  const footerInputRef = useRef<HTMLInputElement>(null);

  // Load existing images on mount
  useEffect(() => {
    loadImages();
  }, []);

  const loadImages = async () => {
    setLoading(true);
    try {
      const result = await getAllHomepageImages();
      if (result.success && result.data) {
        setImages({
          header:
            (result.data as Record<HomepageSection, ImageItem[]>).header || [],
          aktive:
            (result.data as Record<HomepageSection, ImageItem[]>).aktive || [],
          haus:
            (result.data as Record<HomepageSection, ImageItem[]>).haus || [],
          footer:
            (result.data as Record<HomepageSection, ImageItem[]>).footer || [],
        });
      } else {
        toast.error(result.error || "Fehler beim Laden der Bilder");
      }
    } catch (error) {
      toast.error("Fehler beim Laden der Bilder");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (
    files: FileList | null,
    section: HomepageSection
  ) => {
    if (!files || files.length === 0) return;

    setUploading(section);
    setUploadProgress(0);

    try {
      const fileArray = Array.from(files);
      let successCount = 0;

      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i];

        if (!file) {
          continue;
        }

        if (!file.type.startsWith("image/")) {
          toast.error(`${file.name} ist kein Bild`);
          continue;
        }

        // Validate file
        try {
          validateImageFile(file);
        } catch (error) {
          toast.error(
            error instanceof Error ? error.message : "Validierungsfehler"
          );
          continue;
        }

        // Update progress for multiple files
        const baseProgress = (i / fileArray.length) * 100;
        setUploadProgress(baseProgress);

        // Upload to blob storage
        try {
          const imageUrl = await uploadHomepageImage(file, {
            section,
            onProgress: (fileProgress) => {
              const totalProgress =
                baseProgress + fileProgress / fileArray.length;
              setUploadProgress(Math.round(totalProgress));
            },
          });

          // Save to database
          const result = await saveHomepageImage({
            section,
            imageUrl,
            imageName: file.name,
            fileSize: file.size,
            mimeType: file.type,
          });

          if (result.success) {
            successCount++;
            toast.success(`${file.name} erfolgreich hochgeladen`);
          } else {
            toast.error(
              result.error || `Fehler beim Speichern von ${file.name}`
            );
          }
        } catch (uploadError) {
          console.error("Upload error:", uploadError);
          toast.error(`Upload von ${file.name} fehlgeschlagen`);
        }
      }

      if (successCount > 0) {
        await loadImages(); // Reload images
        toast.success(
          `${successCount} Bild${
            successCount > 1 ? "er" : ""
          } erfolgreich hochgeladen`
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Upload fehlgeschlagen"
      );
      console.error(error);
    } finally {
      setUploading(null);
      setUploadProgress(0);
    }
  };

  const handleToggleActive = async (imageId: string) => {
    try {
      const result = await toggleImageActive(imageId);
      if (result.success) {
        toast.success(result.message);
        await loadImages();
      } else {
        toast.error(result.error || "Fehler beim Ändern des Status");
      }
    } catch (error) {
      toast.error("Fehler beim Ändern des Status");
      console.error(error);
    }
  };

  const handleDelete = async (imageId: string, imageName: string) => {
    if (!confirm(`Möchten Sie "${imageName}" wirklich löschen?`)) return;

    setDeletingId(imageId);
    try {
      const result = await deleteHomepageImage(imageId);
      if (result.success) {
        toast.success(result.message);
        await loadImages();
      } else {
        toast.error(result.error || "Fehler beim Löschen");
      }
    } catch (error) {
      toast.error("Fehler beim Löschen");
      console.error(error);
    } finally {
      setDeletingId(null);
    }
  };

  const DropZone = ({
    section,
    inputRef,
    children,
    className = "",
  }: {
    section: HomepageSection;
    inputRef: React.RefObject<HTMLInputElement | null>;
    children: React.ReactNode;
    className?: string;
  }) => {
    const [isDragging, setIsDragging] = useState(false);

    return (
      <div
        className={`relative border-2 border-dashed rounded-lg transition-all cursor-pointer
          ${
            isDragging
              ? "border-primary bg-primary/5 scale-105"
              : "border-border hover:border-primary/50 hover:bg-accent/5"
          }
          ${uploading === section ? "opacity-50 pointer-events-none" : ""}
          ${className}`}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={(e) => {
          e.preventDefault();
          setIsDragging(false);
        }}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          handleFileSelect(e.dataTransfer.files, section);
        }}
        onClick={() => !uploading && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple={section === "aktive" || section === "haus"}
          className="hidden"
          onChange={(e) => handleFileSelect(e.target.files, section)}
          disabled={uploading === section}
        />
        {children}
      </div>
    );
  };

  const ImagePreview = ({
    image,
    onToggle,
    onDelete,
    size = "medium",
  }: {
    image: ImageItem;
    onToggle: () => void;
    onDelete: () => void;
    size?: "small" | "medium" | "large";
  }) => {
    const sizeClasses = {
      small: "w-32 h-32",
      medium: "w-48 h-48",
      large: "w-full h-64",
    };

    const isDeleting = deletingId === image.id;

    return (
      <div
        className={`relative group ${
          sizeClasses[size]
        } rounded-lg overflow-hidden border-2 transition-all
          ${
            image.isActive
              ? "border-green-500 shadow-lg"
              : "border-border opacity-75"
          }
          ${isDeleting ? "opacity-50 scale-95" : ""}`}
      >
        <img
          src={image.imageUrl}
          alt={image.imageName}
          className="w-full h-full object-cover"
        />

        {/* Status badge */}
        <div
          className={`absolute top-2 right-2 px-2 py-1 rounded text-xs font-medium
          ${
            image.isActive
              ? "bg-green-500 text-white"
              : "bg-gray-500 text-white"
          }`}
        >
          {image.isActive ? "Aktiv" : "Inaktiv"}
        </div>

        {/* Hover overlay */}
        <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-3">
          <div className="flex items-center gap-2 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2">
            <Label
              htmlFor={`active-${image.id}`}
              className="text-white text-sm cursor-pointer"
            >
              {image.isActive ? "Deaktivieren" : "Aktivieren"}
            </Label>
            <Switch
              id={`active-${image.id}`}
              checked={image.isActive}
              onCheckedChange={onToggle}
              disabled={isDeleting}
            />
          </div>
          <Button
            size="sm"
            variant="destructive"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            disabled={isDeleting}
          >
            {isDeleting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            <span className="ml-2">Löschen</span>
          </Button>
        </div>

        {/* Image name */}
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-2">
          <p className="text-white text-xs truncate">{image.imageName}</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4" />
          <p className="text-muted-foreground">Lade Bilder...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-foreground">
            Admin Image Manager
          </h1>
          <p className="text-muted-foreground">
            Verwalte die Bilder für deine Homepage
          </p>
        </div>

        {/* Upload Progress Overlay */}
        {uploading && (
          <div className="fixed top-4 right-4 bg-background border rounded-lg p-4 shadow-lg z-50 min-w-[300px]">
            <p className="text-sm font-medium mb-2">
              Lade {uploading} Bilder hoch...
            </p>
            <Progress value={uploadProgress} className="h-2" />
            <p className="text-xs text-muted-foreground mt-1">
              {uploadProgress}%
            </p>
          </div>
        )}

        {/* Header Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <ImageIcon className="w-5 h-5" />
              Header (Frontpage)
              <Badge variant="secondary">Einzelbild</Badge>
              <Badge variant="outline">{images.header.length} gesamt</Badge>
              {images.header.filter((img) => img.isActive).length > 0 && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500">
                  {images.header.filter((img) => img.isActive).length} aktiv
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {images.header.map((image) => (
                <ImagePreview
                  key={image.id}
                  image={image}
                  onToggle={() => handleToggleActive(image.id)}
                  onDelete={() => handleDelete(image.id, image.imageName)}
                  size="large"
                />
              ))}
              <DropZone
                section="header"
                inputRef={headerInputRef}
                className="min-h-[256px]"
              >
                <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2">
                    Header Bild hochladen
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Drag & Drop oder klicken zum Auswählen
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Max. 10MB • JPG, PNG, WebP, SVG
                  </p>
                </div>
              </DropZone>
            </div>
          </CardContent>
        </Card>

        {/* Aktive Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <ImageIcon className="w-5 h-5" />
              Aktive
              <Badge variant="secondary">Mehrere Bilder</Badge>
              <Badge variant="outline">{images.aktive.length} gesamt</Badge>
              {images.aktive.filter((img) => img.isActive).length > 0 && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500">
                  {images.aktive.filter((img) => img.isActive).length} aktiv
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.aktive.map((image) => (
                <ImagePreview
                  key={image.id}
                  image={image}
                  onToggle={() => handleToggleActive(image.id)}
                  onDelete={() => handleDelete(image.id, image.imageName)}
                  size="small"
                />
              ))}
              <DropZone
                section="aktive"
                inputRef={aktivenInputRef}
                className="min-h-[128px]"
              >
                <div className="flex flex-col items-center justify-center h-32 text-center p-2">
                  <Plus className="w-6 h-6 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Bilder hinzufügen
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mehrfachauswahl möglich
                  </p>
                </div>
              </DropZone>
            </div>
          </CardContent>
        </Card>

        {/* Haus Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <ImageIcon className="w-5 h-5" />
              Haus
              <Badge variant="secondary">Mehrere Bilder</Badge>
              <Badge variant="outline">{images.haus.length} gesamt</Badge>
              {images.haus.filter((img) => img.isActive).length > 0 && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500">
                  {images.haus.filter((img) => img.isActive).length} aktiv
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {images.haus.map((image) => (
                <ImagePreview
                  key={image.id}
                  image={image}
                  onToggle={() => handleToggleActive(image.id)}
                  onDelete={() => handleDelete(image.id, image.imageName)}
                  size="small"
                />
              ))}
              <DropZone
                section="haus"
                inputRef={hausInputRef}
                className="min-h-[128px]"
              >
                <div className="flex flex-col items-center justify-center h-32 text-center p-2">
                  <Plus className="w-6 h-6 text-muted-foreground mb-2" />
                  <p className="text-xs text-muted-foreground">
                    Bilder hinzufügen
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Mehrfachauswahl möglich
                  </p>
                </div>
              </DropZone>
            </div>
          </CardContent>
        </Card>

        {/* Footer Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 flex-wrap">
              <ImageIcon className="w-5 h-5" />
              Footer
              <Badge variant="secondary">Einzelbild</Badge>
              <Badge variant="outline">{images.footer.length} gesamt</Badge>
              {images.footer.filter((img) => img.isActive).length > 0 && (
                <Badge className="bg-green-500/10 text-green-600 border-green-500">
                  {images.footer.filter((img) => img.isActive).length} aktiv
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
              {images.footer.map((image) => (
                <ImagePreview
                  key={image.id}
                  image={image}
                  onToggle={() => handleToggleActive(image.id)}
                  onDelete={() => handleDelete(image.id, image.imageName)}
                  size="large"
                />
              ))}
              <DropZone
                section="footer"
                inputRef={footerInputRef}
                className="min-h-[256px]"
              >
                <div className="flex flex-col items-center justify-center h-64 text-center p-6">
                  <Upload className="w-12 h-12 text-muted-foreground mb-4" />
                  <p className="text-lg font-medium text-foreground mb-2">
                    Footer Bild hochladen
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Drag & Drop oder klicken zum Auswählen
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Max. 10MB • JPG, PNG, WebP, SVG
                  </p>
                </div>
              </DropZone>
            </div>
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex justify-center gap-4 pb-8">
          <Button
            size="lg"
            className="px-8"
            variant="outline"
            onClick={loadImages}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Check className="w-4 h-4 mr-2" />
            )}
            Aktualisieren
          </Button>
          <Button
            size="lg"
            className="px-8"
            onClick={() => window.open("/", "_blank")}
          >
            <Eye className="w-4 h-4 mr-2" />
            Homepage ansehen
          </Button>
        </div>
      </div>
    </div>
  );
}
