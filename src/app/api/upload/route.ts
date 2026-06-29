// app/api/upload/route.ts
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireCurrentTenant } from "~/server/lib/tenant-context";

const ALLOWED_SUBPATHS = [
	"profile/",
	"drinks/",
	"homepage/",
	"receipts/",
] as const;

// Vercel names the Blob read-write token `BLOB_READ_WRITE_TOKEN` by default, but
// a store connected with a custom prefix (and/or auto-rotation enabled) exposes
// it as `<PREFIX>_READ_WRITE_TOKEN`. The SDK only auto-reads the default name,
// so we discover whichever `*_READ_WRITE_TOKEN` env var holds a
// `vercel_blob_rw_…` value at runtime. This survives rotation (the value
// changes, the name stays).
function resolveBlobToken(): string | undefined {
	if (process.env.BLOB_READ_WRITE_TOKEN) {
		return process.env.BLOB_READ_WRITE_TOKEN;
	}
	for (const [key, value] of Object.entries(process.env)) {
		if (
			key.endsWith("READ_WRITE_TOKEN") &&
			value?.startsWith("vercel_blob_rw_")
		) {
			return value;
		}
	}
	return undefined;
}

export async function POST(request: Request) {
	const body = (await request.json()) as HandleUploadBody;

	let tenantSlug: string;
	try {
		const tenant = await requireCurrentTenant();
		tenantSlug = tenant.slug;
	} catch {
		return NextResponse.json(
			{ error: "Tenant not resolved for upload request" },
			{ status: 400 },
		);
	}

	const expectedPrefix = `tenants/${tenantSlug}/`;

	try {
		const jsonResponse = await handleUpload({
			body,
			request,
			token: resolveBlobToken(),
			onBeforeGenerateToken: async (pathname) => {
				const normalized = pathname.startsWith("/")
					? pathname.slice(1)
					: pathname;

				// Must live under the resolved tenant's blob namespace.
				if (!normalized.startsWith(expectedPrefix)) {
					throw new Error(
						`Upload path must start with '${expectedPrefix}' (got: ${pathname})`,
					);
				}

				const subpath = normalized.slice(expectedPrefix.length);
				const matched = ALLOWED_SUBPATHS.find((p) => subpath.startsWith(p));
				if (!matched) {
					throw new Error("Unauthorized upload path");
				}

				if (matched === "profile/") {
					return {
						allowedContentTypes: [
							"image/jpeg",
							"image/jpg",
							"image/png",
							"image/webp",
						],
						maximumSizeInBytes: 5 * 1024 * 1024,
						addRandomSuffix: true,
					};
				}

				if (matched === "homepage/") {
					return {
						allowedContentTypes: [
							"image/jpeg",
							"image/jpg",
							"image/png",
							"image/webp",
							"image/svg+xml",
						],
						maximumSizeInBytes: 10 * 1024 * 1024,
						addRandomSuffix: true,
					};
				}

				if (matched === "receipts/") {
					return {
						allowedContentTypes: [
							"image/jpeg",
							"image/jpg",
							"image/png",
							"image/webp",
							"application/pdf",
						],
						maximumSizeInBytes: 10 * 1024 * 1024,
						addRandomSuffix: true,
					};
				}

				// drinks/
				return {
					allowedContentTypes: [
						"image/jpeg",
						"image/jpg",
						"image/png",
						"image/webp",
					],
					maximumSizeInBytes: 5 * 1024 * 1024,
					addRandomSuffix: true,
				};
			},
			onUploadCompleted: async ({ blob }) => {
				console.log("Upload completed:", blob.pathname);
			},
		});

		return NextResponse.json(jsonResponse);
	} catch (error) {
		console.error("Upload route error:", error);
		return NextResponse.json(
			{ error: (error as Error).message },
			{ status: 400 },
		);
	}
}
