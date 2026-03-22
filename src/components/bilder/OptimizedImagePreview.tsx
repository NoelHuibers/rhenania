// components/bilder/OptimizedImagePreview.tsx
"use client";

import { Loader2, Trash2 } from "lucide-react";
import { memo, useCallback, useState } from "react";
import { Button } from "~/components/ui/button";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";

export interface ImageItem {
	id: string;
	imageUrl: string;
	imageName: string;
	section: HomepageSection;
	isActive: boolean;
	displayOrder: number;
	createdAt: Date;
}

export interface ImagePreviewProps {
	image: ImageItem;
	onToggle: () => void;
	onDelete: () => void;
	size?: "small" | "medium" | "large";
	isDeleting: boolean;
	isDragging?: boolean;
}

export const OptimizedImagePreview = memo<ImagePreviewProps>(
	({ image, onToggle, onDelete, size = "medium", isDeleting }) => {
		const [imageLoaded, setImageLoaded] = useState(false);
		const [imageError, setImageError] = useState(false);

		const sizeClasses = {
			small: "w-32 h-32",
			medium: "w-48 h-48",
			large: "w-full h-64",
		};

		const handleDeleteClick = useCallback(
			(e: React.MouseEvent) => {
				e.stopPropagation();
				e.preventDefault();
				onDelete();
			},
			[onDelete],
		);

		const handleImageClick = useCallback(
			(e: React.MouseEvent) => {
				e.preventDefault();
				onToggle();
			},
			[onToggle],
		);

		const handleImageKeyDown = useCallback(
			(e: React.KeyboardEvent) => {
				if (e.key === "Enter" || e.key === " ") {
					e.preventDefault();
					onToggle();
				}
			},
			[onToggle],
		);

		const handleImageLoad = useCallback(() => {
			setImageLoaded(true);
		}, []);

		const handleImageError = useCallback(() => {
			setImageError(true);
		}, []);

		return (
			<div
				className={`group relative ${
					sizeClasses[size]
				} cursor-pointer overflow-hidden rounded-lg border-2 transition-all ${
					image.isActive
						? "border-green-500 shadow-lg"
						: "border-border opacity-75"
				}
        ${isDeleting ? "scale-95 opacity-50" : ""}`}
				role="button"
				tabIndex={0}
				onClick={handleImageClick}
				onKeyDown={handleImageKeyDown}
			>
				{/* Image with loading states */}
				<div className="relative h-full w-full bg-gray-100">
					{!imageLoaded && !imageError && (
						<div className="absolute inset-0 flex items-center justify-center">
							<Loader2 className="h-6 w-6 animate-spin text-gray-400" />
						</div>
					)}

					{imageError ? (
						<div className="absolute inset-0 flex items-center justify-center bg-gray-200">
							<span className="text-gray-500 text-sm">Fehler beim Laden</span>
						</div>
					) : (
						// biome-ignore lint/performance/noImgElement: dynamic blob URL, next/image requires static domain config
						<img
							src={image.imageUrl}
							alt={image.imageName}
							className={`h-full w-full object-cover transition-opacity ${
								imageLoaded ? "opacity-100" : "opacity-0"
							}`}
							onLoad={handleImageLoad}
							onError={handleImageError}
							loading="lazy"
							draggable={false}
						/>
					)}
				</div>

				{/* Status badge */}
				<div
					className={`pointer-events-none absolute top-2 right-2 rounded px-2 py-1 font-medium text-xs ${
						image.isActive
							? "bg-green-500 text-white"
							: "bg-gray-500 text-white"
					}`}
				>
					{image.isActive ? "Aktiv" : "Inaktiv"}
				</div>

				<Button
					size="icon"
					variant="destructive"
					onClick={handleDeleteClick}
					disabled={isDeleting}
					className="absolute right-2 bottom-2 z-50 h-8 w-8 cursor-pointer"
				>
					{isDeleting ? (
						<Loader2 className="h-4 w-4 animate-spin" />
					) : (
						<Trash2 className="h-4 w-4" />
					)}
				</Button>

				{/* Image name */}
				<div className="pointer-events-none absolute right-0 bottom-0 left-0 bg-linear-to-t from-black/80 to-transparent p-2">
					<p className="truncate text-white text-xs">{image.imageName}</p>
				</div>
			</div>
		);
	},
);

OptimizedImagePreview.displayName = "OptimizedImagePreview";
