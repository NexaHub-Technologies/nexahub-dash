import { createFileRoute, redirect } from "@tanstack/react-router";
import { getStaff } from "../lib/auth";

type Search = { sent?: string; error?: string };

const ERRORS: Record<string, string> = {
	invalid: "That email address doesn't look right.",
	failed: "Could not send a link right now. Try again shortly.",
	expired: "That sign-in link has expired or was already used.",
};

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		if (await getStaff()) throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search => ({
		...(typeof s.sent === "string" ? { sent: s.sent } : {}),
		...(typeof s.error === "string" ? { error: s.error } : {}),
	}),
	component: Login,
});

/* No client state: the form posts to /auth/link, which redirects back here
   with ?sent or ?error. */
function Login() {
	const { sent, error } = Route.useSearch();
	return (
		<main className="min-h-screen grid place-items-center px-4">
			<div className="panel w-full max-w-sm p-7">
				<img src="/logo-main.svg" alt="" className="h-9 w-9" />
				<h1 className="text-2xl font-bold mt-5">NexaHub Dash</h1>
				{sent ? (
					<output className="block mt-3 text-ink-soft">
						If <strong>{sent}</strong> belongs to a member of staff, a sign-in
						link is on its way. It works once, for an hour.
					</output>
				) : (
					<form method="post" action="/auth/link" className="mt-5 grid gap-3">
						<label htmlFor="email" className="text-sm font-semibold">
							Work email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							autoComplete="email"
							className="field"
						/>
						{error && (
							<p className="text-sm text-danger" role="alert">
								{ERRORS[error] ?? ERRORS.failed}
							</p>
						)}
						<button type="submit" className="btn btn-primary">
							Email me a sign-in link
						</button>
					</form>
				)}
			</div>
		</main>
	);
}
