import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	CheckCircle2Icon,
	GraduationCapIcon,
	InboxIcon,
	WalletIcon,
} from "lucide-react";
import {
	ListRow,
	Panel,
	PanelEmpty,
	StatCard,
} from "#/components/dashboard/blocks";
import { StatusBadge } from "#/components/dashboard/status-badge";
import { Avatar, AvatarFallback } from "#/components/ui/avatar";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { getCourseMetrics } from "#/lib/catalogue";
import { formatCount, formatDate, timeAgo } from "#/lib/format";

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
					label="Awaiting payment"
					value={formatCount(c.awaitingPayment)}
					Icon={WalletIcon}
					tone="warning"
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

				<Panel
					title="Students on this course"
					to={isAdmin ? "/students" : undefined}
					search={{ course: c.slug }}
				>
					{c.students.length ? (
						<ul className="flex flex-col">
							{c.students.map((st) => (
								<ListRow
									key={st.id}
									leading={
										<Avatar className="size-9">
											<AvatarFallback>{initials(st.full_name)}</AvatarFallback>
										</Avatar>
									}
									title={st.full_name}
									subtitle={
										st.starts_on
											? `Started ${formatDate(st.starts_on)}`
											: undefined
									}
									trailing={<StatusBadge status={st.status} />}
									to={isAdmin ? `/students/${st.id}` : undefined}
								/>
							))}
						</ul>
					) : (
						<PanelEmpty Icon={GraduationCapIcon}>
							Nobody is enrolled yet. Approving an application enrols the
							student here.
						</PanelEmpty>
					)}
				</Panel>
			</div>
		</div>
	);
}
