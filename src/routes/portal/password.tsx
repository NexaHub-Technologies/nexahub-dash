import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription } from "#/components/ui/alert";
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
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Spinner } from "#/components/ui/spinner";
import { toast } from "#/components/ui/toast";
import { changeMyPassword } from "#/lib/portal";

export const Route = createFileRoute("/portal/password")({
	component: PasswordPage,
});

/* Swaps the password the school handed over for one only the student
   knows. */
function PasswordPage() {
	const navigate = useNavigate();
	const [pending, setPending] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const f = new FormData(ev.currentTarget);
		const next = String(f.get("next") ?? "");
		if (next !== String(f.get("again") ?? "")) {
			setError("The two new passwords don't match.");
			return;
		}
		setPending(true);
		const r = await changeMyPassword({
			data: { current: String(f.get("current") ?? ""), next },
		});
		setPending(false);
		if (!r.ok) {
			setError(r.message);
			return;
		}
		toast.add({ title: "Password changed", type: "success" });
		await navigate({ to: "/portal" });
	}

	return (
		<>
			<Button
				variant="ghost"
				size="sm"
				className="-ml-2 self-start"
				nativeButton={false}
				render={<Link to="/portal" />}
			>
				<ArrowLeftIcon data-icon="inline-start" />
				My work
			</Button>
			<Card className="w-full max-w-md">
				<CardHeader>
					<CardTitle>Change your password</CardTitle>
					<CardDescription>
						Choose one only you know. Your other devices are signed out.
					</CardDescription>
				</CardHeader>
				<CardContent>
					<form onSubmit={onSubmit}>
						<FieldGroup>
							{error ? (
								<Alert variant="destructive" role="alert">
									<AlertDescription>{error}</AlertDescription>
								</Alert>
							) : null}
							<Field>
								<FieldLabel htmlFor="pw-current">Current password</FieldLabel>
								<Input
									id="pw-current"
									name="current"
									type="password"
									required
									autoComplete="current-password"
								/>
							</Field>
							<Field>
								<FieldLabel htmlFor="pw-next">New password</FieldLabel>
								<Input
									id="pw-next"
									name="next"
									type="password"
									required
									minLength={10}
									autoComplete="new-password"
								/>
								<FieldDescription>At least 10 characters.</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="pw-again">New password again</FieldLabel>
								<Input
									id="pw-again"
									name="again"
									type="password"
									required
									minLength={10}
									autoComplete="new-password"
								/>
							</Field>
							<Button type="submit" disabled={pending}>
								{pending && <Spinner data-icon="inline-start" />}
								Change password
							</Button>
						</FieldGroup>
					</form>
				</CardContent>
			</Card>
		</>
	);
}
