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
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "#/components/ui/tooltip";
import type { Staff } from "#/lib/auth";
import { formatCount } from "#/lib/format";
import type { OverviewStats } from "#/lib/overview";
import { isActive, MAIN_NAV, type NavItem, OTHER_NAV } from "./nav";

/* The console's navigation (shadcn Sidebar, inset): a drawer on phones
   that closes once a section is chosen. Expanded, the sections share the
   sidebar's height as tabs that carry a live line each ("3 to review").
   Collapsed to the icon rail they become file tabs on the edge of the
   page: the open section comes forward in the page's own colour and joins
   it, the rest sit tucked behind (styles.css, .nav-tab). */
export function AppSidebar({
	role,
	stats,
}: {
	role: Staff["role"];
	stats: OverviewStats;
}) {
	const { pathname } = useLocation();
	const { isMobile, setOpenMobile, state } = useSidebar();
	const close = () => isMobile && setOpenMobile(false);
	const rail = state === "collapsed" && !isMobile;

	const group = (label: string, items: NavItem[]) => {
		const visible = items.filter((n) => !n.admin || role === "admin");
		if (!visible.length) return null;
		return (
			<SidebarGroup className="min-h-0 flex-1">
				<SidebarGroupLabel>{label}</SidebarGroupLabel>
				<ul className="nav-tabs">
					{visible.map((n) => {
						const active = isActive(pathname, n.to);
						const hint = n.hint?.(stats);
						const alert = n.alert?.(stats) ?? 0;
						const hintId = `nav-hint-${n.label.toLowerCase()}`;
						return (
							<li key={n.to}>
								<Tooltip>
									<TooltipTrigger
										render={
											<Link
												to={n.to}
												aria-label={n.label}
												aria-describedby={hint ? hintId : undefined}
												aria-current={active ? "page" : undefined}
												data-active={active || undefined}
												className="nav-tab"
												onClick={close}
											/>
										}
									>
										<span className="nav-tab-icon">
											<n.Icon aria-hidden />
											{alert ? (
												<span aria-hidden className="nav-tab-dot" />
											) : null}
										</span>
										<span className="nav-tab-text">
											<span className="nav-tab-label">{n.label}</span>
											{hint ? (
												<span id={hintId} className="nav-tab-hint">
													{hint}
												</span>
											) : null}
										</span>
										{alert ? (
											<span aria-hidden className="nav-tab-count">
												{formatCount(alert)}
											</span>
										) : null}
									</TooltipTrigger>
									<TooltipContent side="right" align="center" hidden={!rail}>
										{n.label}
										{hint ? (
											<span className="text-background/70"> · {hint}</span>
										) : null}
									</TooltipContent>
								</Tooltip>
							</li>
						);
					})}
				</ul>
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
			{/* visible overflow, so the collapsed tabs can reach the page */}
			<SidebarContent className="group-data-[collapsible=icon]:overflow-visible">
				<nav aria-label="Sections" className="flex min-h-0 flex-1 flex-col">
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
