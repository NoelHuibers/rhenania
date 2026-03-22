// components/bilder/LoadingSpinner.tsx
"use client";

import { Loader2 } from "lucide-react";

export const LoadingSpinner = () => {
	return (
		<div className="flex min-h-screen items-center justify-center bg-background">
			<div className="text-center">
				<Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin" />
				<p className="text-muted-foreground">Lade Bilder...</p>
			</div>
		</div>
	);
};
