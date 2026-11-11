import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { KeyRoundIcon, LogOutIcon } from "lucide-react";
import { Button } from "#/components/ui/button";
import { getViewer } from "../lib/auth";

/* The student portal: where a student finds the projects and exercises
   assigned to them, downloads what they need and uploads their work. It
   shares the login page with the staff console and nothing else. Staff are
   sent to the console; anyone not signed in, to the login page. Every
   server function checks the student again, and the database gives a
   student only their own work. */
export const Route = createFileRoute("/portal")({
	beforeLoad: async () => {
		const viewer = await getViewer();
		if (viewer?.staff) throw redirect({ to: "/" });
		if (!viewer) throw redirect({ to: "/login" });
		return { student: viewer.student };
	},
	head: () => ({ meta: [{ title: "My work · NexaHubTech" }] }),
	component: PortalShell,
});

function PortalShell() {
	const { student } = Route.useRouteContext();
	return (
		<div className="flex min-h-svh flex-col bg-muted/40">
			<header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-[backdrop-filter]:bg-background/70">
				<div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
					<Link to="/portal" className="flex min-w-0 items-center gap-2">
						<img src="/logo-main.svg" alt="" className="size-7" />
						<span className="truncate font-heading text-lg font-extrabold tracking-tight">
							NexaHubTech
						</span>
					</Link>
					<span className="ml-auto hidden truncate text-sm text-muted-foreground sm:block">
						{student.full_name}
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="ml-auto sm:ml-0"
						nativeButton={false}
						render={<Link to="/portal/password" />}
					>
						<KeyRoundIcon data-icon="inline-start" />
						<span className="sr-only sm:not-sr-only">Password</span>
					</Button>
					{/* a plain form POST, so signing out works before the JavaScript loads */}
					<form method="post" action="/auth/signout">
						<Button type="submit" variant="outline" size="sm">
							<LogOutIcon data-icon="inline-start" />
							Logout
						</Button>
					</form>
				</div>
			</header>
			<main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-5 p-4 sm:py-8">
				<Outlet />
			</main>
		</div>
	);
}
