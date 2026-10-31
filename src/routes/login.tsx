import { createFileRoute, redirect } from "@tanstack/react-router";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { getStaff } from "../lib/auth";

type Search = { error?: string; email?: string };

const ERRORS: Record<string, string> = {
	credentials: "That email and password don't match.",
	missing: "Enter your email and password.",
	busy: "Too many attempts. Wait a minute, then try again.",
	failed: "Could not sign in right now. Try again shortly.",
};

export const Route = createFileRoute("/login")({
	beforeLoad: async () => {
		if (await getStaff()) throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search => ({
		...(typeof s.error === "string" ? { error: s.error } : {}),
		...(typeof s.email === "string" ? { email: s.email } : {}),
	}),
	component: Login,
});

/* No client state: the form posts to /auth/signin, which redirects to the
   overview or back here with ?error, so it works the moment the page arrives.
   The email comes back too, so only the password needs typing again. */
function Login() {
	const { error, email } = Route.useSearch();
	const invalid = error ? true : undefined;
	return (
		<main className="stage login-stage grid place-items-center p-4">
			<Card className="login-card w-full max-w-sm">
				<CardHeader>
					<img src="/logo-main.svg" alt="" className="size-9" />
					<CardTitle className="font-heading text-3xl font-extrabold tracking-tight">
						NexaHubTech <span className="hot-on-light-text">Dash</span>
					</CardTitle>
					<CardDescription>Sign in to the staff console</CardDescription>
				</CardHeader>
				<CardContent>
					<form method="post" action="/auth/signin">
						<FieldGroup>
							{error && (
								<Alert variant="destructive" role="alert">
									<AlertDescription>
										{ERRORS[error] ?? ERRORS.failed}
									</AlertDescription>
								</Alert>
							)}
							<Field data-invalid={invalid}>
								<FieldLabel htmlFor="email">Email</FieldLabel>
								<Input
									id="email"
									name="email"
									type="email"
									required
									autoComplete="username"
									defaultValue={email}
									aria-invalid={invalid}
								/>
							</Field>
							<Field data-invalid={invalid}>
								<FieldLabel htmlFor="password">Password</FieldLabel>
								<Input
									id="password"
									name="password"
									type="password"
									required
									autoComplete="current-password"
									aria-invalid={invalid}
									autoFocus={Boolean(email)}
								/>
							</Field>
							<Button type="submit" size="lg" className="btn-hot">
								Sign in
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</main>
	);
}
