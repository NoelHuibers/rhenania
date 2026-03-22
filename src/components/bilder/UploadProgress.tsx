// components/bilder/UploadProgress.tsx
"use client";

import { Progress } from "~/components/ui/progress";
import type { HomepageSection } from "~/server/actions/bilder/homepageImages";

interface UploadProgressProps {
	uploading: HomepageSection | null;
	uploadProgress: number;
}

export const UploadProgress = ({
	uploading,
	uploadProgress,
}: UploadProgressProps) => {
	if (!uploading) return null;

	return (
		<div className="fixed top-4 right-4 z-50 min-w-[300px] rounded-lg border bg-background p-4 shadow-lg">
			<p className="mb-2 font-medium text-sm">
				Lade {uploading} Bilder hoch...
			</p>
			<Progress value={uploadProgress} className="h-2" />
			<p className="mt-1 text-muted-foreground text-xs">{uploadProgress}%</p>
		</div>
	);
};
