import { createFileRoute } from "@tanstack/react-router";
import { requestLoginLink } from "../../lib/login-link.server";

/* The login form posts here as a plain HTML form, so it works the moment
   the page arrives — a tap before the JavaScript has loaded on a slow phone
   still sends the link, rather than silently reloading the form. */
export const Route = createFileRoute("/auth/link")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const form = await request.formData();
				const email = form.get("email");
				const result = await requestLoginLink(
					email,
					new URL(request.url).origin,
				);
				const to = new URL("/login", request.url);
				if (result === "sent")
					to.searchParams.set("sent", String(email).trim());
				else to.searchParams.set("error", result);
				return new Response(null, {
					status: 303,
					headers: { Location: `${to.pathname}${to.search}` },
				});
			},
		},
	},
});
