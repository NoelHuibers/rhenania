// export.ts — "Alle Daten exportieren" for the Admin page (#69).
"use server";

import { del, list, put } from "@vercel/blob";

import { auth, getIdentity } from "~/server/auth";
import { getCurrentTenantDb } from "~/server/db/tenants";
import { log } from "~/server/lib/log";
import { isSuperAdmin } from "~/server/lib/super-admin";
import { requireCurrentTenant } from "~/server/lib/tenant-context";
import { buildTenantExport } from "~/server/lib/tenant-export";

/**
 * How long a download link is meant to live. Vercel Blob URLs don't expire
 * on their own, so exports older than this are deleted at the start of the
 * next export of the same Corps. A link therefore lives at least 24 h and
 * until somebody exports again; a hard limit needs a scheduled cleanup of
 * `tenants/<slug>/exports/` (not in place yet).
 */
const EXPORT_TTL_MS = 24 * 60 * 60 * 1000;

export type TenantExportResult =
	| {
			success: true;
			url: string;
			fileName: string;
			createdAt: string;
			tables: number;
			rows: number;
			files: number;
			missingFiles: number;
	  }
	| { success: false; error: string };

/** Blob folder of a tenant's exports; nothing else is ever deleted. */
function exportPrefix(slug: string) {
	return `tenants/${slug}/exports/`;
}

/** `2026-10-27T13-05-09Z`: sortable and safe in a file name. */
function fileStamp(now: Date) {
	return now
		.toISOString()
		.replace(/\.\d{3}Z$/, "Z")
		.replace(/:/g, "-");
}

/** Deletes this tenant's exports older than `EXPORT_TTL_MS`. Best effort. */
async function deleteExpiredExports(prefix: string, now: Date) {
	try {
		const expired: string[] = [];
		let cursor: string | undefined;
		do {
			const page = await list({ prefix, cursor });
			for (const blob of page.blobs) {
				if (
					blob.pathname.startsWith(prefix) &&
					now.getTime() - new Date(blob.uploadedAt).getTime() >= EXPORT_TTL_MS
				) {
					expired.push(blob.url);
				}
			}
			cursor = page.hasMore ? page.cursor : undefined;
		} while (cursor);
		if (expired.length > 0) {
			await del(expired);
		}
		return expired.length;
	} catch (error) {
		log.warn("tenant export: cleanup failed", {
			error: error instanceof Error ? error.message : String(error),
		});
		return 0;
	}
}

/**
 * Exports all data of the current Corps as a ZIP (see `tenant-export.ts`),
 * uploads it under `tenants/<slug>/exports/` with a random suffix and
 * returns the download link. Tenant Admins and platform superadmins only.
 */
export async function exportTenantData(): Promise<TenantExportResult> {
	const identity = await getIdentity();
	const userId = identity?.user.id;
	if (!userId) {
		return { success: false, error: "Nicht angemeldet" };
	}
	// auth() only returns a session for an active member of this Corps, so a
	// superadmin from elsewhere is checked on the identity alone.
	const session = await auth();
	const isAdmin = session?.user.roles.includes("Admin") ?? false;
	if (!isAdmin && !(await isSuperAdmin(userId))) {
		return { success: false, error: "Keine Berechtigung" };
	}

	const tenant = await requireCurrentTenant();
	const now = new Date();
	const prefix = exportPrefix(tenant.slug);
	const removed = await deleteExpiredExports(prefix, now);

	try {
		const db = await getCurrentTenantDb();
		const { stream, summary } = buildTenantExport(db, {
			tenantName: tenant.displayName,
			now,
		});
		const fileName = `${tenant.slug}-export-${fileStamp(now)}.zip`;
		const blob = await put(`${prefix}${fileName}`, stream, {
			access: "public",
			// The suffix makes the link unguessable; it is the only key.
			addRandomSuffix: true,
			contentType: "application/zip",
			// Deleted exports must not live on in the CDN for the default month.
			cacheControlMaxAge: 60,
			// Uploads in parts while the archive is still being written.
			multipart: true,
		});
		const result = await summary;

		log.info("tenant export", {
			tenant: tenant.slug,
			userId,
			tables: result.tables.length,
			files: result.files,
			missingFiles: result.missingFiles.length,
			removedExports: removed,
		});
		return {
			success: true,
			url: blob.downloadUrl,
			fileName,
			createdAt: now.toISOString(),
			tables: result.tables.length,
			rows: result.tables.reduce((sum, t) => sum + t.rows, 0),
			files: result.files,
			missingFiles: result.missingFiles.length,
		};
	} catch (error) {
		log.error("tenant export failed", {
			tenant: tenant.slug,
			error: error instanceof Error ? error.message : String(error),
		});
		return {
			success: false,
			error: "Der Export ist fehlgeschlagen. Bitte später erneut versuchen.",
		};
	}
}
