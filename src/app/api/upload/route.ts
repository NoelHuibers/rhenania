// app/api/upload/route.ts
import { type HandleUploadBody, handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireCurrentTenant } from "~/server/lib/tenant-context";

const ALLOWED_SUBPATHS = ["profile/", "drinks/", "homepage/"] as const;

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
