import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BookOpenIcon,
	CheckCircle2Icon,
	CreditCardIcon,
	InboxIcon,
	type LucideIcon,
	MailWarningIcon,
	ReceiptIcon,
	WalletIcon,
} from "lucide-react";
import {
	IconChip,
	ListRow,
	Panel,
	PanelEmpty,
	type Tone,
} from "#/components/dashboard/blocks";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Card } from "#/components/ui/card";
import { Separator } from "#/components/ui/separator";
import { formatCount, formatNaira, timeAgo } from "#/lib/format";
import { getDashboard } from "#/lib/overview";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_app/")({
	loader: () => getDashboard(),
	component: Dashboard,
});

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");

const STATUS_TONE: Record<string, "secondary" | "outline" | "destructive"> = {
	new: "secondary",
	approved: "outline",
	declined: "destructive",
};

/* The dashboard, after the DistressNow admin console: what needs the team's
   attention, the fee position, then the latest activity. */
function Dashboard() {
	const { staff } = Route.useRouteContext();
	const d = Route.useLoaderData();
	const isAdmin = staff.role === "admin";

	const queue: {
		label: string;
		count: number;
		Icon: LucideIcon;
		tone: Tone;
		adminOnly: boolean;
		to?: string;
		search?: Record<string, string>;
	}[] = [
		{
			label: "Applications to review",
			count: d.attention.newApplications,
			Icon: InboxIcon,
			tone: "warning",
			adminOnly: true,
			to: "/applications",
		},
		{
			label: "Overdue invoices",
			count: d.attention.overdueInvoices,
			Icon: ReceiptIcon,
			tone: "danger",
			adminOnly: true,
			to: "/fees",
			search: { status: "overdue" },
		},
		{
			label: "Messages not sent",
			count: d.attention.failedMessages,
			Icon: MailWarningIcon,
			tone: "brand",
			adminOnly: true,
		},
	];

	return (
		<div className="flex flex-col gap-6">
			{/* the header names the section; this names the page for screen readers */}
			<h1 className="sr-only">Dashboard</h1>

			<div
				className={cn(
					"grid items-stretch gap-6",
					isAdmin && "xl:grid-cols-[minmax(0,1fr)_20rem]",
				)}
			>
				{isAdmin ? (
					<Panel
						title="Needs attention"
						description="Queues waiting on the team right now."
					>
						<ul className="grid grid-cols-2 gap-3 lg:grid-cols-3">
							{queue
								.filter((q) => isAdmin || !q.adminOnly)
								.map(({ label, count, Icon, tone, to, search }) => {
									const clear = count === 0;
									const cls = cn(
										"flex h-full flex-col gap-3 rounded-lg border p-4",
										clear && "border-line-soft",
										to && "transition-colors hover:bg-muted",
									);
									const body = (
										<>
											<IconChip
												Icon={clear ? CheckCircle2Icon : Icon}
												tone={clear ? "success" : tone}
												className="size-9"
											/>
											<span className="flex flex-col">
												<span className="font-heading text-2xl font-semibold tabular-nums">
													{formatCount(count)}
												</span>
												<span className="text-xs text-muted-foreground">
													{clear ? `${label} · all clear` : label}
												</span>
											</span>
										</>
									);
									return (
										<li key={label}>
											{to ? (
												<Link to={to} search={search} className={cls}>
													{body}
												</Link>
											) : (
												<div className={cls}>{body}</div>
											)}
										</li>
									);
								})}
						</ul>
					</Panel>
				) : null}

				{isAdmin ? (
					<Card className="stage flex flex-col justify-between gap-5 p-5 sm:p-6">
						<Link
							to="/fees/payments"
							className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground hover:underline"
						>
							<WalletIcon aria-hidden className="size-4" /> Fees collected this
							month
						</Link>
						<p className="stat-value w-fit font-heading text-4xl font-extrabold tracking-tight tabular-nums">
							{formatNaira(d.fees.collectedThisMonthKobo)}
						</p>
						<Separator />
						<div className="flex flex-col gap-2 text-sm">
							<p className="flex items-center justify-between">
								<span className="flex items-center gap-2 text-muted-foreground">
									<CreditCardIcon aria-hidden className="size-4" /> Payments
								</span>
								<span className="font-semibold tabular-nums">
									{formatCount(d.fees.payments)}
								</span>
							</p>
							<p className="flex items-center justify-between">
								<span className="flex items-center gap-2 text-muted-foreground">
									<ReceiptIcon aria-hidden className="size-4" /> Outstanding
								</span>
								<span className="font-semibold tabular-nums">
									{formatNaira(d.fees.outstandingKobo)}
								</span>
							</p>
						</div>
					</Card>
				) : null}
			</div>

			<div className="grid items-start gap-6 xl:grid-cols-2">
				{isAdmin ? (
					<Panel title="Recent applications" to="/applications">
						{d.recentApplications.length ? (
							<ul className="flex flex-col">
								{d.recentApplications.map((a) => (
									<ListRow
										key={a.id}
										leading={
											<Avatar className="size-9">
												<AvatarFallback>{initials(a.full_name)}</AvatarFallback>
											</Avatar>
										}
										title={a.full_name}
										subtitle={a.course}
										trailing={
											<>
												<Badge
													variant={STATUS_TONE[a.status] ?? "outline"}
													className="capitalize"
												>
													{a.status}
												</Badge>
												<span>{timeAgo(a.created_at)}</span>
											</>
										}
										to={`/applications/${a.id}`}
									/>
								))}
							</ul>
						) : (
							<PanelEmpty Icon={InboxIcon}>
								No applications yet. They arrive here from the website's enrol
								form.
							</PanelEmpty>
						)}
					</Panel>
				) : null}

				<Panel title="Courses" to="/courses">
					{d.courses.length ? (
						<ul className="flex flex-col">
							{d.courses.map((c) => (
								<ListRow
									key={c.slug}
									leading={
										<IconChip
											Icon={BookOpenIcon}
											tone="brand"
											className="size-9"
										/>
									}
									title={c.title}
									subtitle={`${formatCount(c.activeStudents)} active students`}
									trailing={
										isAdmin ? (
											<span className="tabular-nums">
												{formatCount(c.applicants)} applicants
											</span>
										) : undefined
									}
									to={`/courses/${c.slug}`}
								/>
							))}
						</ul>
					) : (
						<PanelEmpty Icon={BookOpenIcon}>
							No courses yet. Each appears with its first application.
						</PanelEmpty>
					)}
				</Panel>
			</div>
		</div>
	);
}
