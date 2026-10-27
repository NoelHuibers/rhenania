import { getAuthForRequest } from "~/server/auth";
import { toCoreCallback } from "~/server/auth/legacy-callback";

// Each Corps has its own Better Auth instance (its domains, its Microsoft
// login), picked by the request's host. Microsoft redirects to the
// pre-1.7 callback path registered in each Entra app (see legacy-callback).
async function handler(request: Request): Promise<Response> {
	const tenantAuth = await getAuthForRequest(request.headers);
	if (!tenantAuth) {
		return new Response("Not Found", { status: 404 });
	}
	return tenantAuth.handler(await toCoreCallback(request));
}

export {
	handler as DELETE,
	handler as GET,
	handler as PATCH,
	handler as POST,
	handler as PUT,
};
