import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { GraduationCapIcon } from "lucide-react";
import { Filters } from "#/components/dashboard/filters";
import { LinkTabs } from "#/components/dashboard/link-tabs";
import { Section } from "#/components/dashboard/section";
import { StatusBadge } from "#/components/dashboard/status-badge";
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
import { formatDate, formatNaira } from "#/lib/format";
import {
	type EnrolmentStatus,
	isStatus,
	STATUS_LABEL,
	STATUSES,
} from "#/lib/status";
import { listStudents } from "#/lib/students";

type Search = { status?: EnrolmentStatus; q?: string; course?: string };

export const Route = createFileRoute("/_app/students/")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search => ({
		...(isStatus(s.status) ? { status: s.status } : {}),
		...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
		...(typeof s.course === "string" && s.course ? { course: s.course } : {}),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => listStudents({ data: deps }),
	component: Registry,
});

/* The student registry: one row per student per course, newest first, with
   their status and what they still owe. */
function Registry() {
	const { rows, counts, courses } = Route.useLoaderData();
	const search = Route.useSearch();
	const total = Object.values(counts).reduce((n, c) => n + (c ?? 0), 0);

	return (
		<Section
			title="Students"
			description="Everyone enrolled on a course. Open a student to update their details or status, record a payment, or download their record."
			toolbar={
				<Filters
					action="/students"
					status={search.status}
					q={search.q}
					course={search.course}
					courses={courses}
					placeholder="Search name, email or phone"
				/>
			}
		>
			<LinkTabs
				label="Student status"
				tabs={[
					{
						key: "all",
						label: "All",
						to: "/students",
						search: { ...search, status: undefined },
						count: total,
						active: !search.status,
					},
					...STATUSES.map((s) => ({
						key: s,
						label: STATUS_LABEL[s],
						to: "/students",
						search: { ...search, status: s },
						count: counts[s] ?? 0,
						active: search.status === s,
					})),
				]}
			/>
			{rows.length ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Student</TableHead>
							<TableHead>Course</TableHead>
							<TableHead>Status</TableHead>
							<TableHead className="hidden md:table-cell">Started</TableHead>
							<TableHead className="text-right">Owes</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((r) => (
							<TableRow key={r.enrolment_id}>
								<TableCell>
									<Link
										to="/students/$id"
										params={{ id: r.student_id }}
										className="flex flex-col"
									>
										<span className="font-medium hover:underline">
											{r.full_name}
										</span>
										<span className="text-xs text-muted-foreground">
											{r.phone ?? r.email}
										</span>
									</Link>
								</TableCell>
								<TableCell>{r.course}</TableCell>
								<TableCell>
									<StatusBadge status={r.status} />
								</TableCell>
								<TableCell className="hidden whitespace-nowrap text-muted-foreground md:table-cell">
									{r.starts_on ? formatDate(r.starts_on) : "—"}
								</TableCell>
								<TableCell className="text-right tabular-nums">
									{r.balance_kobo > 0 ? formatNaira(r.balance_kobo) : "—"}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
				</Table>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<GraduationCapIcon />
						</EmptyMedia>
						<EmptyTitle>
							{search.q || search.course || search.status
								? "No matching students"
								: "No students yet"}
						</EmptyTitle>
						<EmptyDescription>
							Students appear here when an application is approved.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}
