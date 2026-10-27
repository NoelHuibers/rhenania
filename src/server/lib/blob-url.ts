// Checks for file links that point into a Corps' own Vercel Blob folder.
// Not a server-action module — imported by actions that store or delete files.

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * True when `url` is an https Vercel Blob file under
 * `tenants/<slug>/<folder>`. `folder` must end with "/".
 *
 * The raw link is checked too: dot segments and encoded slashes are refused
 * even though `new URL` would resolve them, so a link can't look like it sits
 * in the folder while naming another file.
 */
export function isTenantBlobUrl(
	url: string | null | undefined,
	slug: string,
	folder: string,
): url is string {
	if (!url || !slug) {
		return false;
	}
	if (/(^|[/\\])(\.|%2e){1,2}([/\\?#]|$)|%2f|%5c|\\/i.test(url)) {
		return false;
	}
	try {
		const u = new URL(url);
		return (
			u.protocol === "https:" &&
			u.hostname.endsWith(BLOB_HOST_SUFFIX) &&
			u.hostname.length > BLOB_HOST_SUFFIX.length &&
			u.username === "" &&
			u.password === "" &&
			u.port === "" &&
			u.pathname.startsWith(`/tenants/${slug}/${folder}`) &&
			u.pathname.length > `/tenants/${slug}/${folder}`.length
		);
	} catch {
		return false;
	}
}

/** A receipt uploaded by the Kostenerstattung dialog for this Corps. */
export function isTenantReceiptUrl(url: string, slug: string): boolean {
	return isTenantBlobUrl(url, slug, "receipts/");
}
