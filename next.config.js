/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

// Security headers for every response. The CSP starts in report-only mode
// (it can't break anything); browsers send violations to /api/csp-report,
// which logs them as "csp violation". Switch to "Content-Security-Policy"
// once those logs stay empty.
const isDev = process.env.NODE_ENV === "development";
const CSP_REPORT_PATH = "/api/csp-report";
const contentSecurityPolicy = [
	"default-src 'self'",
	// React needs eval in development only (error stacks); production doesn't.
	`script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data: blob: https://*.public.blob.vercel-storage.com",
	"font-src 'self' data:",
	"connect-src 'self' https://*.public.blob.vercel-storage.com https://vercel.com https://*.vercel-insights.com",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self' https://login.microsoftonline.com",
	"object-src 'none'",
	// `report-to` (Reporting API) wins where supported, `report-uri` covers
	// Firefox.
	`report-uri ${CSP_REPORT_PATH}`,
	"report-to csp",
].join("; ");

const securityHeaders = [
	{
		key: "Strict-Transport-Security",
		value: "max-age=63072000; includeSubDomains",
	},
	{ key: "X-Content-Type-Options", value: "nosniff" },
	{ key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
	{
		key: "Permissions-Policy",
		value: "camera=(), microphone=(), geolocation=(), payment=()",
	},
	// Enforced now: the app is never meant to be framed (clickjacking).
	{ key: "X-Frame-Options", value: "DENY" },
	{ key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
	{ key: "Content-Security-Policy-Report-Only", value: contentSecurityPolicy },
	{ key: "Reporting-Endpoints", value: `csp="${CSP_REPORT_PATH}"` },
];

/** @type {import("next").NextConfig} */
const config = {
	async headers() {
		return [{ source: "/:path*", headers: securityHeaders }];
	},
	// Tenant provisioning (superadmin) runs the drizzle migrations at runtime
	// from ./drizzle; make sure the SQL files ship with those functions.
	outputFileTracingIncludes: {
		"/superadmin/**": ["./drizzle/**/*"],
	},
	images: {
		remotePatterns: [
			{
				protocol: "https",
				hostname: "*.public.blob.vercel-storage.com",
				port: "",
				pathname: "/**",
			},
		],
	},
};

export default config;
