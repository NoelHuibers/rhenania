// http.ts — helpers for calling third-party HTTP APIs.

/**
 * Reads the body of a failed response for an error message. A body can be
 * consumed only once, so it is read as text and parsed as JSON when possible;
 * plain-text bodies (e.g. a proxy's "Bad Gateway") are returned as is.
 */
export async function readErrorBody(res: Response): Promise<unknown> {
	let text: string;
	try {
		text = await res.text();
	} catch {
		return null;
	}
	try {
		return JSON.parse(text);
	} catch {
		return text;
	}
}
