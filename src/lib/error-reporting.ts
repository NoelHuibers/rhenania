// error-reporting.ts — helpers for the error screens.
//
// The error screens show Next's digest of a server error, never its message
// or stack: messages can carry personal data, and the digest is enough for
// support to find the full error in the server logs.

/** Next's digest of a server error (`error.digest`), if there is one. */
export function errorDigest(error: unknown): string | undefined {
	if (typeof error === "object" && error !== null && "digest" in error) {
		const digest = (error as { digest: unknown }).digest;
		if (typeof digest === "string" && digest.length > 0) {
			return digest;
		}
		if (typeof digest === "number") {
			return String(digest);
		}
	}
	return undefined;
}
