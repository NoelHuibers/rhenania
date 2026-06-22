// lib/receipt-upload.ts (Client util) — uploads Kostenrückerstattung receipts
// (PDF or image) to the tenant's blob namespace. Mirrors blob-upload.ts.
"use client";
import { upload } from "@vercel/blob/client";

interface UploadReceiptOptions {
	tenantSlug: string;
	onProgress?: (progress: number) => void;
}

const MAX_SIZE = 10 * 1024 * 1024; // 10MB
const VALID_TYPES = [
	"image/jpeg",
	"image/jpg",
	"image/png",
	"image/webp",
	"application/pdf",
];

export function validateReceiptFile(file: File): boolean {
	if (file.size > MAX_SIZE) {
		throw new Error("Datei ist zu groß. Maximale Größe: 10MB");
	}
	if (!VALID_TYPES.includes(file.type)) {
		throw new Error("Ungültiger Dateityp. Erlaubt: JPG, PNG, WebP, PDF");
	}
	return true;
}

export async function uploadReceipt(
	file: File,
	options: UploadReceiptOptions,
): Promise<string> {
	validateReceiptFile(file);

	try {
		const blob = await upload(
			`tenants/${options.tenantSlug}/receipts/${Date.now()}-${file.name}`,
			file,
			{
				access: "public",
				handleUploadUrl: "/api/upload",
				onUploadProgress: (p) => {
					if (options.onProgress) {
						options.onProgress((p.loaded / p.total) * 100);
					}
				},
			},
		);
		return blob.url;
	} catch (error) {
		console.error("Error uploading receipt:", error);
		throw new Error(`Fehler beim Hochladen des Belegs: ${error}`);
	}
}
