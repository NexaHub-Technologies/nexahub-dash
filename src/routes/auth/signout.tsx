import { createFileRoute } from "@tanstack/react-router";
import { neonAuth } from "../../lib/neon-auth.server";

/* A plain form POST rather than a client call: the session cookies are
   cleared in the response and the browser follows the redirect itself, so
   signing out works with or without JavaScript. POST only, so a link or a
   prefetch can never sign anyone out. */
export const Route = createFileRoute("/auth/signout")({
	server: {
		handlers: {
			POST: async () => {
				await neonAuth().signOut();
				return new Response(null, {
					status: 303,
					headers: { Location: "/login" },
				});
			},
		},
	},
});
