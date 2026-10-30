import { createFileRoute } from "@tanstack/react-router";
import { neonAuth } from "../../lib/neon-auth.server";

/* The login form posts here as a plain HTML form, so it works the moment
   the page arrives: a tap before the JavaScript has loaded on a slow phone
   still signs in, rather than silently reloading the form. Neon Auth checks
   the password and its session cookies go out with the redirect. */
export const Route = createFileRoute("/auth/signin")({
	server: {
		handlers: {
			POST: async ({ request }) => {
				const form = await request.formData();
				const email = String(form.get("email") ?? "")
					.trim()
					.toLowerCase();
				const password = String(form.get("password") ?? "");
				const back = (error: string) =>
					new Response(null, {
						status: 303,
						headers: {
							Location: `/login?error=${error}&email=${encodeURIComponent(email)}`,
						},
					});
				if (!email || !password) return back("missing");

				const { error } = await neonAuth().signIn.email({ email, password });
				if (error) {
					// a wrong email and a wrong password get the same answer
					if (error.status === 401) return back("credentials");
					if (error.status === 429) return back("busy");
					console.error(
						"sign-in failed:",
						error.status,
						error.code,
						error.message,
					);
					return back("failed");
				}
				/* A right password still needs an active staff row; the app's
				   layout checks that and sends anyone else back here. */
				return new Response(null, { status: 303, headers: { Location: "/" } });
			},
		},
	},
});
