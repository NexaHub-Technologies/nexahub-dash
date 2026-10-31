import { Link } from "@tanstack/react-router";
import {
	ArrowUpRightIcon,
	ChevronRightIcon,
	type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "#/components/ui/card";
import { cn } from "#/lib/utils";

/* The console's building blocks, after the DistressNow admin console's
   dashboard blocks: a tinted icon chip, a metric card, a titled panel, a
   two-line list row and a quiet empty state. */

const TONES = {
	success: "bg-success-soft text-success",
	warning: "bg-warning-soft text-warning",
	danger: "bg-danger-soft text-danger",
	info: "bg-info-soft text-info",
	brand: "bg-brand-soft text-brand",
	neutral: "bg-muted text-foreground",
} as const;
export type Tone = keyof typeof TONES;

export function IconChip({
	Icon,
	tone,
	className,
}: {
	Icon: LucideIcon;
	tone: Tone;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"grid size-10 shrink-0 place-items-center rounded-full",
				TONES[tone],
				className,
			)}
		>
			<Icon aria-hidden className="size-5" />
		</span>
	);
}

/* A metric; the whole card links somewhere when `to` is set. */
export function StatCard({
	label,
	value,
	Icon,
	tone,
	to,
	search,
	footer,
}: {
	label: string;
	value: ReactNode;
	Icon: LucideIcon;
	tone: Tone;
	to?: string;
	search?: Record<string, string>;
	footer?: ReactNode;
}) {
	const body = (
		<>
			<div className="flex items-start justify-between gap-3">
				<IconChip Icon={Icon} tone={tone} />
				{to ? (
					<ArrowUpRightIcon
						aria-hidden
						className="size-4 text-muted-foreground transition-transform group-hover/stat:translate-x-0.5 group-hover/stat:-translate-y-0.5 group-hover/stat:text-foreground"
					/>
				) : null}
			</div>
			<div className="flex flex-col gap-0.5">
				<span className="stat-value w-fit font-heading text-4xl font-extrabold tracking-tight tabular-nums">
					{value}
				</span>
				<span className="text-sm text-muted-foreground">{label}</span>
			</div>
			{footer ? (
				<div className="text-xs text-muted-foreground">{footer}</div>
			) : null}
		</>
	);
	const cls = "flex h-full flex-col gap-4 p-4 sm:p-5";
	return (
		<Card className={cn("py-0", to && "group/stat card-lift")}>
			{to ? (
				<Link
					to={to}
					search={search}
					className={cn(
						cls,
						"rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
					)}
				>
					{body}
				</Link>
			) : (
				<div className={cls}>{body}</div>
			)}
		</Card>
	);
}

/* A titled card with an optional "See all" link or action. */
export function Panel({
	title,
	description,
	to,
	search,
	linkLabel = "See all",
	action,
	className,
	children,
}: {
	title: string;
	description?: string;
	to?: string;
	search?: Record<string, string>;
	linkLabel?: string;
	action?: ReactNode;
	className?: string;
	children: ReactNode;
}) {
	return (
		<Card className={cn("flex min-w-0 flex-col gap-4 p-5 sm:p-6", className)}>
			<div className="flex items-start justify-between gap-4">
				<div className="flex flex-col gap-0.5">
					<h2 className="text-lg font-bold">{title}</h2>
					{description ? (
						<p className="text-sm text-muted-foreground">{description}</p>
					) : null}
				</div>
				{action}
				{to ? (
					<Link
						to={to}
						search={search}
						className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						{linkLabel} <ChevronRightIcon aria-hidden className="size-4" />
					</Link>
				) : null}
			</div>
			{children}
		</Card>
	);
}

/* Leading chip or avatar, two lines, trailing meta; a link when `to` is set. */
export function ListRow({
	leading,
	title,
	subtitle,
	trailing,
	to,
}: {
	leading: ReactNode;
	title: ReactNode;
	subtitle?: ReactNode;
	trailing?: ReactNode;
	to?: string;
}) {
	const body = (
		<>
			{leading}
			<span className="flex min-w-0 flex-1 flex-col">
				<span className="truncate text-sm font-medium">{title}</span>
				{subtitle ? (
					<span className="truncate text-xs text-muted-foreground">
						{subtitle}
					</span>
				) : null}
			</span>
			{trailing ? (
				<span className="flex shrink-0 flex-col items-end gap-1 text-xs text-muted-foreground">
					{trailing}
				</span>
			) : null}
		</>
	);
	const cls = "-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5";
	return (
		<li>
			{to ? (
				<Link to={to} className={cn(cls, "transition-colors hover:bg-muted")}>
					{body}
				</Link>
			) : (
				<div className={cls}>{body}</div>
			)}
		</li>
	);
}

/* A quiet placeholder for a panel with nothing in it yet. */
export function PanelEmpty({
	Icon,
	children,
}: {
	Icon: LucideIcon;
	children: ReactNode;
}) {
	return (
		<div className="flex flex-col items-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm text-muted-foreground">
			<Icon aria-hidden className="size-6" />
			{children}
		</div>
	);
}
