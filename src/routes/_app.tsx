import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
} from "@tanstack/react-router";
import { getStaff } from "../lib/auth";

/* Every signed-in screen sits under this layout. The check runs on each
   navigation, so someone deactivated mid-session is sent to the login page
   the next time they move. */
export const Route = createFileRoute("/_app")({
	beforeLoad: async () => {
		const staff = await getStaff();
		if (!staff) throw redirect({ to: "/login" });
		return { staff };
	},
	component: AppShell,
});

/* sections appear here as each build phase lands */
const NAV = [{ to: "/", label: "Overview" }] as const;

function AppShell() {
	const { staff } = Route.useRouteContext();
	return (
		<div className="min-h-screen md:grid md:grid-cols-[15rem_1fr]">
			<aside className="border-b md:border-b-0 md:border-r border-line-soft bg-card px-4 py-4 md:py-6 flex md:flex-col gap-4 md:gap-6 items-center md:items-stretch">
				<div className="flex items-center gap-2.5">
					<img src="/logo-main.svg" alt="" className="h-7 w-7" />
					<span className="font-display font-bold">NexaHub Dash</span>
				</div>
				<nav aria-label="Sections" className="flex md:flex-col gap-1 flex-1">
					{NAV.map((n) => (
						<Link
							key={n.to}
							to={n.to}
							className="rounded-lg px-3 py-2 text-sm font-semibold text-ink-soft hover:bg-paper-2"
							activeProps={{ className: "bg-violet-tint text-violet-deep" }}
							activeOptions={{ exact: true }}
						>
							{n.label}
						</Link>
					))}
				</nav>
				<div className="text-sm hidden md:block">
					<p className="font-semibold">{staff.full_name}</p>
					<p className="text-mute capitalize">{staff.role}</p>
				</div>
				<form method="post" action="/auth/signout">
					<button type="submit" className="btn btn-ghost text-sm">
						Sign out
					</button>
				</form>
			</aside>
			<main className="px-4 md:px-8 py-6 md:py-8 min-w-0">
				<Outlet />
			</main>
		</div>
	);
}
