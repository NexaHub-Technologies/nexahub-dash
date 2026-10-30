import {
	createFileRoute,
	Link,
	Outlet,
	redirect,
	useLocation,
} from "@tanstack/react-router";
import { LayoutDashboardIcon, LogOutIcon, UsersIcon } from "lucide-react";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Button } from "#/components/ui/button";
import { Separator } from "#/components/ui/separator";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupContent,
	SidebarHeader,
	SidebarInset,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarProvider,
	SidebarTrigger,
	useSidebar,
} from "#/components/ui/sidebar";
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

/* sections appear here as each build phase lands; `admin` ones are hidden
   from instructors (their routes refuse them too) */
const NAV = [
	{ to: "/", label: "Overview", icon: LayoutDashboardIcon, admin: false },
	{ to: "/staff", label: "Staff", icon: UsersIcon, admin: true },
] as const;

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");

/* On a phone the sidebar is a drawer over the page; it closes once a section
   is chosen, or the new page would sit behind it. */
function NavItem({
	item,
	active,
}: {
	item: (typeof NAV)[number];
	active: boolean;
}) {
	const { setOpenMobile } = useSidebar();
	return (
		<SidebarMenuItem>
			<SidebarMenuButton
				isActive={active}
				render={<Link to={item.to} onClick={() => setOpenMobile(false)} />}
			>
				<item.icon />
				<span>{item.label}</span>
			</SidebarMenuButton>
		</SidebarMenuItem>
	);
}

function AppShell() {
	const { staff } = Route.useRouteContext();
	const { pathname } = useLocation();
	const nav = NAV.filter((n) => !n.admin || staff.role === "admin");
	const current = nav.find((n) => n.to === pathname)?.label ?? "NexaHub Dash";
	return (
		<SidebarProvider>
			<Sidebar>
				<SidebarHeader>
					<div className="flex items-center gap-2.5 px-2 py-1.5">
						<img src="/logo-main.svg" alt="" className="size-7" />
						<span className="font-heading font-bold">NexaHub Dash</span>
					</div>
				</SidebarHeader>
				<SidebarContent>
					<SidebarGroup>
						<SidebarGroupContent>
							<SidebarMenu>
								{nav.map((n) => (
									<NavItem key={n.to} item={n} active={pathname === n.to} />
								))}
							</SidebarMenu>
						</SidebarGroupContent>
					</SidebarGroup>
				</SidebarContent>
				<SidebarFooter>
					<div className="flex items-center gap-3 px-2 py-1.5">
						<Avatar>
							<AvatarFallback>{initials(staff.full_name)}</AvatarFallback>
						</Avatar>
						<div className="flex min-w-0 flex-col text-sm">
							<span className="truncate font-semibold">{staff.full_name}</span>
							<span className="text-muted-foreground capitalize">
								{staff.role}
							</span>
						</div>
					</div>
					{/* a plain form POST, so signing out works before the JavaScript loads */}
					<form method="post" action="/auth/signout">
						<Button
							type="submit"
							variant="ghost"
							className="w-full justify-start"
						>
							<LogOutIcon data-icon="inline-start" />
							Sign out
						</Button>
					</form>
				</SidebarFooter>
			</Sidebar>
			<SidebarInset>
				<header className="flex h-14 items-center gap-2 border-b px-4">
					<SidebarTrigger />
					<Separator orientation="vertical" className="h-5" />
					<span className="text-sm font-semibold">{current}</span>
				</header>
				<main className="flex min-w-0 flex-col gap-6 p-4 md:p-8">
					<Outlet />
				</main>
			</SidebarInset>
		</SidebarProvider>
	);
}
