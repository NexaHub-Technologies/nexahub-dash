import { Link, useLocation } from "@tanstack/react-router";
import { ArrowLeftIcon, LogOutIcon } from "lucide-react";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	SidebarRail,
	useSidebar,
} from "#/components/ui/sidebar";
import type { Staff } from "#/lib/auth";
import { isActive, MAIN_NAV, type NavItem, OTHER_NAV } from "./nav";

/* the active section: a solid ink pill, as in the DistressNow console */
const ACTIVE =
	"data-active:bg-ink data-active:text-white data-active:hover:bg-ink data-active:hover:text-white";

/* The console's navigation (shadcn Sidebar, inset): an icon rail when
   collapsed on desktop, a drawer on phones that closes once a section is
   chosen. */
export function AppSidebar({ role }: { role: Staff["role"] }) {
	const { pathname } = useLocation();
	const { isMobile, setOpenMobile } = useSidebar();
	const close = () => isMobile && setOpenMobile(false);

	const group = (label: string, items: NavItem[]) => {
		const visible = items.filter((n) => !n.admin || role === "admin");
		if (!visible.length) return null;
		return (
			<SidebarGroup>
				<SidebarGroupLabel>{label}</SidebarGroupLabel>
				<SidebarMenu>
					{visible.map((n) => {
						const active = isActive(pathname, n.to);
						return (
							<SidebarMenuItem key={n.to}>
								<SidebarMenuButton
									isActive={active}
									tooltip={n.label}
									className={ACTIVE}
									render={
										<Link
											to={n.to}
											aria-current={active ? "page" : undefined}
											onClick={close}
										/>
									}
								>
									<n.Icon aria-hidden />
									<span>{n.label}</span>
								</SidebarMenuButton>
							</SidebarMenuItem>
						);
					})}
				</SidebarMenu>
			</SidebarGroup>
		);
	};

	return (
		<Sidebar variant="inset" collapsible="icon">
			<SidebarHeader>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							size="lg"
							tooltip="Dashboard"
							render={
								<Link to="/" aria-label="Dashboard home" onClick={close} />
							}
						>
							<span className="grid size-8 shrink-0 place-items-center overflow-hidden rounded-md bg-card">
								<img src="/logo-main.svg" alt="" className="size-6" />
							</span>
							<span className="grid leading-tight">
								<span className="truncate font-heading font-semibold">
									NexaHub
								</span>
								<span className="truncate text-xs text-muted-foreground">
									Staff console
								</span>
							</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarHeader>
			<SidebarContent>
				<nav aria-label="Sections">
					{group("Main", MAIN_NAV)}
					{group("Others", OTHER_NAV)}
				</nav>
			</SidebarContent>
			<SidebarFooter>
				<SidebarMenu>
					<SidebarMenuItem>
						<SidebarMenuButton
							tooltip="Back to site"
							render={
								// biome-ignore lint/a11y/useAnchorContent: Base UI renders the button's icon and label inside this link
								<a
									href="https://nexahubtech.company"
									aria-label="Back to site"
								/>
							}
						>
							<ArrowLeftIcon aria-hidden />
							<span>Back to site</span>
						</SidebarMenuButton>
					</SidebarMenuItem>
					<SidebarMenuItem>
						{/* a plain form POST, so signing out works before the JavaScript loads */}
						<form method="post" action="/auth/signout">
							<SidebarMenuButton type="submit" tooltip="Logout">
								<LogOutIcon aria-hidden />
								<span>Logout</span>
							</SidebarMenuButton>
						</form>
					</SidebarMenuItem>
				</SidebarMenu>
			</SidebarFooter>
			<SidebarRail />
		</Sidebar>
	);
}
