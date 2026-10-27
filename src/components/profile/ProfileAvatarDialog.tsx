"use client";

import { upload } from "@vercel/blob/client";
import { Camera, RefreshCw, Upload } from "lucide-react";
import {
	type TransitionStartFunction,
	useEffect,
	useRef,
	useState,
} from "react";
import { toast } from "sonner";
import { useTenantSlug } from "~/components/TenantProvider";
import { Avatar, AvatarFallback, AvatarImage } from "~/components/ui/avatar";
import { Button } from "~/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { updateUserAvatarUrl } from "~/server/actions/profile/avatar";

/** "Bild ändern" button and dialog: upload a profile picture or set it by URL. */
export function ProfileAvatarDialog({
	userId,
	isPending,
	startTransition,
	onImageChange,
}: {
	userId: string;
	isPending: boolean;
	startTransition: TransitionStartFunction;
	onImageChange: (image: string) => void;
}) {
	const tenantSlug = useTenantSlug();
	const [newAvatarUrl, setNewAvatarUrl] = useState("");
	const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
	const [uploadingFile, setUploadingFile] = useState(false);
	const [selectedFile, setSelectedFile] = useState<File | null>(null);
	const [previewUrl, setPreviewUrl] = useState<string | null>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	// Cleanup preview URL when component unmounts or file changes
	useEffect(() => {
		return () => {
			if (previewUrl) {
				URL.revokeObjectURL(previewUrl);
			}
		};
	}, [previewUrl]);

	const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
		const file = event.target.files?.[0];
		if (!file) {
			return;
		}

		// Validate file type
		const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
		if (!allowedTypes.includes(file.type)) {
			toast.error("Ungültiger Dateityp. Erlaubt sind: JPEG, PNG, WebP");
			return;
		}

		// Validate file size (5MB max)
		const maxSize = 5 * 1024 * 1024;
		if (file.size > maxSize) {
			toast.error("Datei ist zu groß. Maximum: 5MB");
			return;
		}

		setSelectedFile(file);

		// Create preview URL
		if (previewUrl) {
			URL.revokeObjectURL(previewUrl);
		}
		const newPreviewUrl = URL.createObjectURL(file);
		setPreviewUrl(newPreviewUrl);
	};

	const handleFileUpload = async () => {
		if (!selectedFile) {
			toast.error("Keine Datei ausgewählt");
			return;
		}

		setUploadingFile(true);
		try {
			// Upload file to Vercel Blob
			const blob = await upload(
				`tenants/${tenantSlug}/profile/${selectedFile.name}`,
				selectedFile,
				{
					access: "public",
					handleUploadUrl: "/api/upload",
					clientPayload: `profile/${userId}/${selectedFile.name}`,
				},
			);

			// Update user avatar URL in database
			const formData = new FormData();
			formData.append("imageUrl", blob.url);

			const result = await updateUserAvatarUrl(formData);

			if (result.success) {
				toast.success("Profilbild erfolgreich hochgeladen");
				setAvatarDialogOpen(false);

				// Update local state
				onImageChange(blob.url);

				// Reset file selection
				setSelectedFile(null);
				setPreviewUrl(null);
				if (fileInputRef.current) {
					fileInputRef.current.value = "";
				}
			} else {
				toast.error(result.message || "Upload fehlgeschlagen");
			}
		} catch (error) {
			console.error("Upload error:", error);
			toast.error(
				error instanceof Error
					? error.message
					: "Fehler beim Hochladen des Bildes",
			);
		} finally {
			setUploadingFile(false);
		}
	};

	const handleAvatarUrlChange = () => {
		if (!newAvatarUrl.trim()) {
			toast.error("Image URL cannot be empty.");
			return;
		}

		startTransition(async () => {
			try {
				const formData = new FormData();
				formData.append("imageUrl", newAvatarUrl.trim());

				const result = await updateUserAvatarUrl(formData);

				if (result.success) {
					toast.success(result.message);
					setAvatarDialogOpen(false);
					// Update local state
					onImageChange(newAvatarUrl.trim());
					setNewAvatarUrl("");
				}
			} catch (error) {
				toast.error(
					error instanceof Error
						? error.message
						: "Failed to update profile picture",
				);
			}
		});
	};

	return (
		<Dialog
			open={avatarDialogOpen}
			onOpenChange={(open) => {
				setAvatarDialogOpen(open);
				// Reset states when dialog closes
				if (!open) {
					setSelectedFile(null);
					setPreviewUrl(null);
					setNewAvatarUrl("");
					if (fileInputRef.current) {
						fileInputRef.current.value = "";
					}
				}
			}}
		>
			<DialogTrigger asChild>
				<Button
					variant="outline"
					className="w-full bg-transparent"
					disabled={isPending}
				>
					<Camera className="mr-2 h-4 w-4" />
					Bild ändern
				</Button>
			</DialogTrigger>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Profilbild ändern</DialogTitle>
				</DialogHeader>
				<Tabs defaultValue="upload">
					<TabsList layout="fill">
						<TabsTrigger value="upload">Upload</TabsTrigger>
						<TabsTrigger value="url">URL</TabsTrigger>
					</TabsList>
					<TabsContent value="upload" className="space-y-4">
						<div className="space-y-4">
							<div
								className="cursor-pointer rounded-lg border-2 border-muted-foreground/25 border-dashed p-6 text-center transition-colors hover:border-muted-foreground/50"
								onClick={() => fileInputRef.current?.click()}
								role="button"
								tabIndex={0}
								onKeyDown={(e) => {
									if (e.key === "Enter" || e.key === " ") {
										fileInputRef.current?.click();
									}
								}}
							>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/jpeg,image/jpg,image/png,image/webp"
									onChange={handleFileSelect}
									className="hidden"
								/>

								{previewUrl ? (
									<div className="space-y-3">
										<Avatar className="mx-auto h-20 w-20">
											<AvatarImage src={previewUrl} />
											<AvatarFallback>Preview</AvatarFallback>
										</Avatar>
										<p className="text-muted-foreground text-sm">
											{selectedFile?.name}
										</p>
										<Button
											variant="outline"
											size="sm"
											onClick={(e) => {
												e.stopPropagation();
												setSelectedFile(null);
												setPreviewUrl(null);
												if (fileInputRef.current) {
													fileInputRef.current.value = "";
												}
											}}
										>
											Andere Datei wählen
										</Button>
									</div>
								) : (
									<>
										<Upload className="mx-auto h-12 w-12 text-muted-foreground" />
										<p className="mt-2 text-muted-foreground text-sm">
											Klicken Sie hier oder ziehen Sie eine Datei herein
										</p>
										<p className="text-muted-foreground text-xs">
											JPEG, PNG oder WebP (max. 5MB)
										</p>
									</>
								)}
							</div>

							{selectedFile && (
								<Button
									onClick={handleFileUpload}
									className="w-full"
									disabled={uploadingFile}
								>
									{uploadingFile ? (
										<>
											<RefreshCw className="mr-2 h-4 w-4 animate-spin" />
											Wird hochgeladen...
										</>
									) : (
										<>
											<Upload className="mr-2 h-4 w-4" />
											Bild hochladen
										</>
									)}
								</Button>
							)}
						</div>
					</TabsContent>
					<TabsContent value="url" className="space-y-4">
						<div>
							<Label htmlFor="avatar-url" className="pb-2">
								Image URL
							</Label>
							<Input
								id="avatar-url"
								placeholder="https://example.com/avatar.jpg"
								value={newAvatarUrl}
								onChange={(e) => setNewAvatarUrl(e.target.value)}
							/>
						</div>
						{newAvatarUrl && (
							<div className="flex justify-center">
								<Avatar className="h-16 w-16">
									<AvatarImage src={newAvatarUrl || "/placeholder.svg"} />
									<AvatarFallback>Preview</AvatarFallback>
								</Avatar>
							</div>
						)}
						<Button
							onClick={handleAvatarUrlChange}
							className="w-full"
							disabled={isPending || !newAvatarUrl.trim()}
						>
							{isPending ? "Speichert..." : "Bild speichern"}
						</Button>
					</TabsContent>
				</Tabs>
			</DialogContent>
		</Dialog>
	);
}
