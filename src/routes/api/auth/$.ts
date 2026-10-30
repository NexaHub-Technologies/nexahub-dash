import { createFileRoute } from "@tanstack/react-router";
import { proxyAuth } from "../../../lib/neon-auth.server";

/* Neon Auth, served from this app's own origin. The emailed sign-in link
   opens /api/auth/magic-link/verify here; Neon checks the token, and its
   session cookie comes back on dash.nexahubtech.company. */
const handle = ({
	request,
	params,
}: {
	request: Request;
	params: { _splat?: string };
}) => proxyAuth(request, params._splat ?? "");

export const Route = createFileRoute("/api/auth/$")({
	server: { handlers: { GET: handle, POST: handle } },
});
