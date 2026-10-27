import { getAuthForRequest } from "~/server/auth";

// Each Corps has its own Better Auth instance (its domains, its Microsoft
// login), picked by the request's host.
async function handler(request: Request): Promise<Response> {
	const tenantAuth = await getAuthForRequest(request.headers);
	if (!tenantAuth) {
		return new Response("Not Found", { status: 404 });
	}
	return tenantAuth.handler(request);
}

export {
	handler as DELETE,
	handler as GET,
	handler as PATCH,
	handler as POST,
	handler as PUT,
};
