/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
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
