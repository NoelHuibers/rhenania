// local-host.ts — decides which hosts are served over plain http.
//
// Local development and E2E run on `localhost`, tenant subdomains such as
// `hassia.localhost` and loopback addresses, all without TLS. Every other
// host is public and served over https.

function hostnameOf(host: string): string {
	const lower = host.trim().toLowerCase();
	if (lower.startsWith("[")) {
		// IPv6 literal, e.g. "[::1]:3000"
		const end = lower.indexOf("]");
		return end === -1 ? lower : lower.slice(0, end + 1);
	}
	return lower.split(":")[0] ?? "";
}

/** True for `localhost`, `*.localhost`, `127.*` and `[::1]`, with or without port. */
export function isLocalHost(host: string): boolean {
	const hostname = hostnameOf(host);
	return (
		hostname === "localhost" ||
		hostname.endsWith(".localhost") ||
		/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname) ||
		hostname === "[::1]"
	);
}

export function protocolForHost(host: string): "http" | "https" {
	return isLocalHost(host) ? "http" : "https";
}
