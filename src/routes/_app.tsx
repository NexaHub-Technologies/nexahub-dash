import {
	createFileRoute,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { AppSidebar } from "#/components/dashboard/app-sidebar";
import { currentSection } from "#/components/dashboard/nav";
import { Overview } from "#/components/dashboard/overview";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Separator } from "#/components/ui/separator";
import {
	SidebarInset,
	SidebarProvider,
	SidebarTrigger,
} from "#/components/ui/sidebar";
import { getStaff } from "../lib/auth";
import { getOverviewStats } from "../lib/overview";
import { getShellPrefs } from "../lib/shell";

/* Every signed-in screen sits under this layout, which follows the
   DistressNow admin console: an inset sidebar, a sticky header naming the
   section, the overview figures, then the page. The staff check runs on each
   navigation, so someone deactivated mid-session is sent to the login page
   the next time they move. */
export const Route = createFileRoute("/_app")({
	beforeLoad: async () => {
		const staff = await getStaff();
		if (!staff) throw redirect({ to: "/login" });
		return { staff };
	},
	loader: async () => {
		const [stats, prefs] = await Promise.all([
			getOverviewStats(),
			getShellPrefs(),
		]);
		return { stats, prefs };
	},
	component: AppShell,
});

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");

function AppShell() {
	const { staff } = Route.useRouteContext();
	const { stats, prefs } = Route.useLoaderData();
	const { pathname } = useLocation();
	return (
		<SidebarProvider
			defaultOpen={prefs.sidebarOpen}
			className="lg:h-svh lg:overflow-hidden"
		>
			<AppSidebar role={staff.role} />
			<SidebarInset className="min-w-0 lg:overflow-y-auto lg:overscroll-contain">
				<header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b bg-background/85 px-4 backdrop-blur supports-[backdrop-filter]:bg-background/70 sm:gap-3">
					<SidebarTrigger className="-ml-1" />
					<Separator
						orientation="vertical"
						className="mr-1 data-vertical:h-4 data-vertical:self-center"
					/>
					<span className="truncate text-sm font-medium">
						{currentSection(pathname)}
					</span>
					<div className="ml-auto flex items-center gap-2">
						<Avatar>
							<AvatarFallback>{initials(staff.full_name)}</AvatarFallback>
						</Avatar>
						<span className="hidden leading-tight sm:block">
							<span className="block text-sm capitalize">{staff.role}</span>
							<span className="block text-xs text-muted-foreground">
								{staff.email}
							</span>
						</span>
					</div>
				</header>
				<div className="grid min-w-0 grid-cols-[minmax(0,1fr)] content-start gap-5 p-4 lg:p-6">
					<Overview
						stats={stats}
						isAdmin={staff.role === "admin"}
						initialPrefs={prefs.overview}
					/>
					<Outlet />
				</div>
			</SidebarInset>
		</SidebarProvider>
	);
}
