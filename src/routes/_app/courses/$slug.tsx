import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	CalendarRangeIcon,
	CheckCircle2Icon,
	GraduationCapIcon,
	InboxIcon,
	UsersRoundIcon,
} from "lucide-react";
import {
	IconChip,
	ListRow,
	Panel,
	PanelEmpty,
	StatCard,
} from "#/components/dashboard/blocks";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { getCourseMetrics } from "#/lib/catalogue";
import { formatCount, timeAgo } from "#/lib/format";

export const Route = createFileRoute("/_app/courses/$slug")({
	loader: async ({ params }) => {
		const course = await getCourseMetrics({ data: params.slug });
		if (!course) throw notFound();
		return course;
	},
	component: Course,
});

const initials = (name: string) =>
	name
		.split(/\s+/)
		.slice(0, 2)
		.map((w) => w[0]?.toUpperCase())
		.join("");

const STATUS: Record<string, "secondary" | "outline" | "destructive"> = {
	new: "secondary",
	approved: "outline",
	declined: "destructive",
};

const day = new Intl.DateTimeFormat("en-NG", {
	day: "numeric",
	month: "short",
	timeZone: "Africa/Lagos",
});
const dateOnly = (d: string) => day.format(new Date(`${d}T12:00:00Z`));

function Course() {
	const c = Route.useLoaderData();
	const { staff } = Route.useRouteContext();
	const isAdmin = staff.role === "admin";

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h1 className="text-2xl font-bold">{c.title}</h1>
				<Button
					variant="ghost"
					size="sm"
					nativeButton={false}
					render={<Link to="/courses" />}
				>
					<ArrowLeftIcon data-icon="inline-start" />
					All courses
				</Button>
			</div>

			<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
				{isAdmin ? (
					<StatCard
						label="Applicants"
						value={formatCount(c.applicants)}
						Icon={InboxIcon}
						tone="brand"
						footer={`${formatCount(c.waiting)} waiting · ${formatCount(c.approved)} approved`}
					/>
				) : null}
				<StatCard
					label="Active students"
					value={formatCount(c.activeStudents)}
					Icon={GraduationCapIcon}
					tone="success"
				/>
				<StatCard
					label="Completed"
					value={formatCount(c.completed)}
					Icon={CheckCircle2Icon}
					tone="neutral"
				/>
				<StatCard
					label="Active cohorts"
					value={formatCount(c.activeCohorts)}
					Icon={UsersRoundIcon}
					tone="info"
				/>
			</div>

			<div className="grid items-start gap-6 xl:grid-cols-2">
				{isAdmin ? (
					<Panel title="Latest applicants">
						{c.recentApplicants.length ? (
							<ul className="flex flex-col">
								{c.recentApplicants.map((a) => (
									<ListRow
										key={a.id}
										leading={
											<Avatar className="size-9">
												<AvatarFallback>{initials(a.full_name)}</AvatarFallback>
											</Avatar>
										}
										title={a.full_name}
										trailing={
											<>
												<Badge
													variant={STATUS[a.status] ?? "outline"}
													className="capitalize"
												>
													{a.status}
												</Badge>
												<span>{timeAgo(a.created_at)}</span>
											</>
										}
									/>
								))}
							</ul>
						) : (
							<PanelEmpty Icon={InboxIcon}>No applications yet.</PanelEmpty>
						)}
					</Panel>
				) : null}

				<Panel title="Current cohorts">
					{c.cohorts.length ? (
						<ul className="flex flex-col">
							{c.cohorts.map((h) => (
								<ListRow
									key={h.id}
									leading={
										<IconChip
											Icon={CalendarRangeIcon}
											tone="info"
											className="size-9"
										/>
									}
									title={h.name}
									subtitle={`${dateOnly(h.starts_on)} – ${dateOnly(h.ends_on)}`}
									trailing={
										<span className="tabular-nums">
											{formatCount(h.activeStudents)} students
										</span>
									}
								/>
							))}
						</ul>
					) : (
						<PanelEmpty Icon={CalendarRangeIcon}>
							No cohorts running for this course.
						</PanelEmpty>
					)}
				</Panel>
			</div>
		</div>
	);
}
