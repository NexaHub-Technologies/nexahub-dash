import { useLocation } from "@tanstack/react-router";
import {
	AlarmClockIcon,
	BookOpenIcon,
	ChevronDownIcon,
	InboxIcon,
	UsersIcon,
} from "lucide-react";
import { useId, useState } from "react";
import { formatCount } from "#/lib/format";
import type { OverviewStats } from "#/lib/overview";
import {
	OVERVIEW_COOKIE,
	type OverviewPrefs,
	type OverviewScope,
} from "#/lib/shell";
import { cn } from "#/lib/utils";
import { StatCard } from "./blocks";

const ONE_YEAR = 60 * 60 * 24 * 365;

function persist(prefs: OverviewPrefs) {
	try {
		document.cookie = `${OVERVIEW_COOKIE}=${encodeURIComponent(JSON.stringify(prefs))}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
	} catch {
		// storage blocked: the choice simply isn't remembered
	}
}

function summary(s: OverviewStats, isAdmin: boolean) {
	return [
		isAdmin && `${formatCount(s.newApplications)} new applications`,
		`${formatCount(s.students)} active students`,
		isAdmin && `${formatCount(s.overdueInvoices)} overdue invoices`,
		`${formatCount(s.courses)} courses`,
	]
		.filter(Boolean)
		.join(" · ");
}

/* The headline figures above every page, as in the DistressNow console:
   open on the dashboard, folded to a one-line summary elsewhere. Folding or
   unfolding is remembered per scope in a cookie the server reads, so the
   first paint already matches. */
export function Overview({
	stats,
	isAdmin,
	initialPrefs,
}: {
	stats: OverviewStats;
	isAdmin: boolean;
	initialPrefs: OverviewPrefs;
}) {
	const { pathname } = useLocation();
	const [prefs, setPrefs] = useState(initialPrefs);
	const regionId = useId();
	const scope: OverviewScope = pathname === "/" ? "home" : "pages";
	const expanded = prefs[scope] ?? scope === "home";

	function toggle() {
		const next = { ...prefs, [scope]: !expanded };
		setPrefs(next);
		persist(next);
	}

	return (
		<section aria-label="Overview" className="grid grid-cols-[minmax(0,1fr)]">
			<button
				type="button"
				aria-expanded={expanded}
				aria-controls={regionId}
				onClick={toggle}
				className={cn(
					"group flex min-h-10 w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
					"outline-none hover:bg-card focus-visible:ring-2 focus-visible:ring-ring/50",
					!expanded && "border bg-card shadow-xs",
				)}
			>
				<span className="shrink-0 font-heading font-semibold">Overview</span>
				<span
					aria-hidden={expanded}
					className={cn(
						"min-w-0 flex-1 truncate text-muted-foreground transition-opacity duration-200 motion-reduce:transition-none",
						expanded && "opacity-0",
					)}
				>
					{summary(stats, isAdmin)}
				</span>
				<ChevronDownIcon
					aria-hidden
					className={cn(
						"size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none",
						expanded && "rotate-180",
					)}
				/>
			</button>
			<div
				id={regionId}
				hidden={!expanded}
				className="grid grid-cols-2 gap-4 pt-3 xl:grid-cols-4"
			>
				{isAdmin ? (
					<StatCard
						label="New applications"
						value={formatCount(stats.newApplications)}
						Icon={InboxIcon}
						tone="warning"
					/>
				) : null}
				<StatCard
					label="Active students"
					value={formatCount(stats.students)}
					Icon={UsersIcon}
					tone="success"
				/>
				{isAdmin ? (
					<StatCard
						label="Overdue invoices"
						value={formatCount(stats.overdueInvoices)}
						Icon={AlarmClockIcon}
						tone={stats.overdueInvoices ? "danger" : "success"}
						to="/fees"
						search={{ status: "overdue" }}
					/>
				) : null}
				<StatCard
					label="Courses"
					value={formatCount(stats.courses)}
					Icon={BookOpenIcon}
					tone="brand"
					to="/courses"
				/>
			</div>
		</section>
	);
}
