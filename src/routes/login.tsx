import { createFileRoute, redirect } from "@tanstack/react-router";
import { MailCheckIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Field,
	FieldError,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
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
   with ?sent or ?error, so it works the moment the page arrives. */
function Login() {
	const { sent, error } = Route.useSearch();
	return (
		<main className="grid min-h-screen place-items-center p-4">
			<Card className="w-full max-w-sm">
				<CardHeader>
					<img src="/logo-main.svg" alt="" className="size-9" />
					<CardTitle className="text-2xl">NexaHub Dash</CardTitle>
					<CardDescription>Staff sign-in</CardDescription>
				</CardHeader>
				<CardContent>
					{sent ? (
						<Alert>
							<MailCheckIcon />
							<AlertTitle>Check your email</AlertTitle>
							<AlertDescription>
								<output>
									If <strong>{sent}</strong> belongs to a member of staff, a
									sign-in link is on its way. It works once, for 15 minutes.
								</output>
							</AlertDescription>
						</Alert>
					) : (
						<form method="post" action="/auth/link">
							<FieldGroup>
								<Field data-invalid={error ? true : undefined}>
									<FieldLabel htmlFor="email">Work email</FieldLabel>
									<Input
										id="email"
										name="email"
										type="email"
										required
										autoComplete="email"
										aria-invalid={error ? true : undefined}
									/>
									{error && (
										<FieldError role="alert">
											{ERRORS[error] ?? ERRORS.failed}
										</FieldError>
									)}
								</Field>
								<Button type="submit">Email me a sign-in link</Button>
							</FieldGroup>
						</form>
					)}
				</CardContent>
			</Card>
		</main>
	);
}
