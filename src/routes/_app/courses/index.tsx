import { createFileRoute, Link } from "@tanstack/react-router";
import {
	BookOpenIcon,
	GraduationCapIcon,
	InboxIcon,
	WalletIcon,
} from "lucide-react";
import { StatCard } from "#/components/dashboard/blocks";
import { Section } from "#/components/dashboard/section";
import { Badge } from "#/components/ui/badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { listCourseMetrics } from "#/lib/catalogue";
import { formatCount } from "#/lib/format";

export const Route = createFileRoute("/_app/courses/")({
	loader: () => listCourseMetrics(),
	component: Courses,
});

const sum = (rows: { [k: string]: unknown }[], key: string) =>
	rows.reduce((n, r) => n + Number(r[key] ?? 0), 0);

/* How each course is doing: who has applied and who is studying now.
   Applicants and students are admin business. */
function Courses() {
	const courses = Route.useLoaderData();
	const { staff } = Route.useRouteContext();
	const isAdmin = staff.role === "admin";

	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
				{isAdmin ? (
					<>
						<StatCard
							label="Applicants"
							value={formatCount(sum(courses, "applicants"))}
							Icon={InboxIcon}
							tone="brand"
						/>
						<StatCard
							label="Waiting for review"
							value={formatCount(sum(courses, "waiting"))}
							Icon={InboxIcon}
							tone="warning"
						/>
					</>
				) : null}
				<StatCard
					label="Active students"
					value={formatCount(sum(courses, "activeStudents"))}
					Icon={GraduationCapIcon}
					tone="success"
				/>
				<StatCard
					label="Awaiting payment"
					value={formatCount(sum(courses, "awaitingPayment"))}
					Icon={WalletIcon}
					tone="warning"
				/>
			</div>

			<Section
				title="Courses"
				description="Applicants and students for each course. A course the website adds appears here with its first application."
			>
				{courses.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Course</TableHead>
								{isAdmin ? (
									<TableHead className="text-right">Applicants</TableHead>
								) : null}
								<TableHead className="text-right">Active students</TableHead>
								<TableHead className="hidden text-right sm:table-cell">
									Completed
								</TableHead>
								<TableHead className="hidden text-right sm:table-cell">
									Awaiting payment
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{courses.map((c) => (
								<TableRow key={c.slug}>
									<TableCell>
										<Link
											to="/courses/$slug"
											params={{ slug: c.slug }}
											className="font-medium hover:underline"
										>
											{c.title}
										</Link>
									</TableCell>
									{isAdmin ? (
										<TableCell className="text-right">
											<span className="inline-flex items-center justify-end gap-2 tabular-nums">
												{c.waiting ? (
													<Badge variant="secondary">
														{formatCount(c.waiting)} new
													</Badge>
												) : null}
												{formatCount(c.applicants)}
											</span>
										</TableCell>
									) : null}
									<TableCell className="text-right tabular-nums">
										{formatCount(c.activeStudents)}
									</TableCell>
									<TableCell className="hidden text-right tabular-nums sm:table-cell">
										{formatCount(c.completed)}
									</TableCell>
									<TableCell className="hidden text-right tabular-nums sm:table-cell">
										{formatCount(c.awaitingPayment)}
									</TableCell>
								</TableRow>
							))}
						</TableBody>
					</Table>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<BookOpenIcon />
							</EmptyMedia>
							<EmptyTitle>No courses yet</EmptyTitle>
							<EmptyDescription>
								Each course appears here with its first application from the
								website.
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</Section>
		</div>
	);
}
