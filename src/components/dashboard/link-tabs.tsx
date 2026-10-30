import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";

/* Underline tabs that are links, after the DistressNow console: each tab is
   a filter in the URL, so it can be bookmarked, shared and used with the
   back button. */
export function LinkTabs({
	label,
	tabs,
}: {
	label: string;
	tabs: {
		key: string;
		label: string;
		to: string;
		search: Record<string, string | undefined>;
		count?: number;
		active: boolean;
	}[];
}) {
	return (
		<nav aria-label={label} className="-mx-1 overflow-x-auto border-b">
			<ul className="flex min-w-max gap-1 px-1">
				{tabs.map((t) => (
					<li key={t.key}>
						<Link
							to={t.to}
							search={t.search}
							aria-current={t.active ? "page" : undefined}
							className={cn(
								"-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
								t.active
									? "border-ink font-semibold text-foreground"
									: "border-transparent text-muted-foreground hover:text-foreground",
							)}
						>
							{t.label}
							{t.count === undefined ? null : (
								<span className="text-muted-foreground tabular-nums">
									{t.count}
								</span>
							)}
						</Link>
					</li>
				))}
			</ul>
		</nav>
	);
}
