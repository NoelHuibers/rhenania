// app/api/upload/route.ts
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const isProfilePath =
          pathname.startsWith("profile/") || pathname.startsWith("/profile/");
        const isDrinksPath =
          pathname.startsWith("drinks/") || pathname.startsWith("/drinks/");
        const isPicturesPath =
          pathname.startsWith("homepage/") || pathname.startsWith("/homepage/");

        if (!isDrinksPath && !isPicturesPath && !isProfilePath) {
          throw new Error("Unauthorized upload path");
        }

        // Settings for profile pictures
        if (isProfilePath) {
          return {
            allowedContentTypes: [
              "image/jpeg",
              "image/jpg",
              "image/png",
              "image/webp",
            ],
            maximumSizeInBytes: 5 * 1024 * 1024, // 5MB for profile pictures
            addRandomSuffix: true,
          };
        }

        // Settings for homepage pictures
        if (isPicturesPath) {
          return {
            allowedContentTypes: [
              "image/jpeg",
              "image/jpg",
              "image/png",
              "image/webp",
              "image/svg+xml",
            ],
            maximumSizeInBytes: 10 * 1024 * 1024, // 10MB for homepage images
            addRandomSuffix: true,
          };
        }

        // Default settings for drinks
        return {
          allowedContentTypes: [
            "image/jpeg",
            "image/jpg",
            "image/png",
            "image/webp",
          ],
          maximumSizeInBytes: 5 * 1024 * 1024, // 5MB for drink images
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
      { status: 400 }
    );
  }
}
