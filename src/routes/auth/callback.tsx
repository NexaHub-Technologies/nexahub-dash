import { createFileRoute } from "@tanstack/react-router";
import { exchangeVerifier } from "../../lib/neon-auth.server";

/* Where Neon sends the browser after it has checked an emailed sign-in link.
   The one-time verifier in the URL becomes a session cookie here, and the
   person lands on the overview; anything else goes back to the login form. */
export const Route = createFileRoute("/auth/callback")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const verifier = new URL(request.url).searchParams.get(
					"neon_auth_session_verifier",
				);
				const cookies = verifier
					? await exchangeVerifier(request, verifier)
					: null;
				const headers = new Headers({
					Location: cookies ? "/" : "/login?error=expired",
				});
				for (const cookie of cookies ?? [])
					headers.append("Set-Cookie", cookie);
				return new Response(null, { status: 303, headers });
			},
		},
	},
});
