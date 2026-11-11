import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ClipboardListIcon } from "lucide-react";
import { NewAssessmentButton } from "#/components/dashboard/assessment-dialogs";
import { Section } from "#/components/dashboard/section";
import { TonePill } from "#/components/dashboard/status-badge";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { KIND_LABEL } from "#/lib/assessment-status";
import { type AssessmentRow, listAssessments } from "#/lib/assessments";
import { formatCount } from "#/lib/format";

type Search = { course?: string };

export const Route = createFileRoute("/_app/assessments/")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search => ({
		...(typeof s.course === "string" && s.course ? { course: s.course } : {}),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => listAssessments({ data: { course: deps.course } }),
	component: Assessments,
});

/* Every course's assessment track: the projects and exercises typed in for
   it, in order, with how many students have each and how many uploads are
   waiting for a grade. */
function Assessments() {
	const { rows, courses } = Route.useLoaderData();
	const search = Route.useSearch();
	const navigate = Route.useNavigate();

	// one block per course, in the order the rows arrive (by course, then track)
	const tracks: { course: string; slug: string; rows: AssessmentRow[] }[] = [];
	for (const r of rows) {
		const last = tracks.at(-1);
		if (last?.slug === r.course_slug) last.rows.push(r);
		else tracks.push({ course: r.course, slug: r.course_slug, rows: [r] });
	}

	return (
		<Section
			title="Assessments"
			description="Each course's projects and exercises. Add the work, assign it, open it when students are ready, then mark what they upload."
			toolbar={
				<>
					<Select
						items={[
							{ label: "All courses", value: "" },
							...courses.map((c) => ({ label: c.title, value: c.slug })),
						]}
						value={search.course ?? ""}
						onValueChange={(v) =>
							navigate({ search: v ? { course: String(v) } : {} })
						}
					>
						<SelectTrigger aria-label="Course" className="max-w-56">
							<SelectValue />
						</SelectTrigger>
						<SelectContent>
							<SelectGroup>
								<SelectItem value="">All courses</SelectItem>
								{courses.map((c) => (
									<SelectItem key={c.slug} value={c.slug}>
										{c.title}
									</SelectItem>
								))}
							</SelectGroup>
						</SelectContent>
					</Select>
					<NewAssessmentButton courses={courses} course={search.course} />
				</>
			}
		>
			{tracks.length ? (
				<div className="flex flex-col gap-6">
					{tracks.map((t) => (
						<section key={t.slug} className="flex flex-col gap-2">
							<h2 className="text-lg font-bold">{t.course}</h2>
							<Table>
								<TableHeader>
									<TableRow>
										<TableHead>Work</TableHead>
										<TableHead className="hidden text-right sm:table-cell">
											Assigned
										</TableHead>
										<TableHead className="hidden text-right md:table-cell">
											Locked
										</TableHead>
										<TableHead className="text-right">To grade</TableHead>
										<TableHead className="hidden text-right sm:table-cell">
											Graded
										</TableHead>
									</TableRow>
								</TableHeader>
								<TableBody>
									{t.rows.map((a, i) => (
										<TableRow key={a.id}>
											<TableCell className="whitespace-normal">
												<Link
													to="/assessments/$id"
													params={{ id: a.id }}
													className="flex flex-col"
												>
													<span className="font-medium hover:underline">
														{i + 1}. {a.title}
													</span>
													<span className="text-xs text-muted-foreground">
														{KIND_LABEL[a.kind]} · {a.files}{" "}
														{a.files === 1 ? "file" : "files"}
													</span>
												</Link>
											</TableCell>
											<TableCell className="hidden text-right tabular-nums sm:table-cell">
												{formatCount(a.assigned)}
											</TableCell>
											<TableCell className="hidden text-right tabular-nums md:table-cell">
												{formatCount(a.locked)}
											</TableCell>
											<TableCell className="text-right">
												{a.toMark ? (
													<TonePill tone="warning">
														{formatCount(a.toMark)} to grade
													</TonePill>
												) : (
													<span className="text-muted-foreground">—</span>
												)}
											</TableCell>
											<TableCell className="hidden text-right tabular-nums sm:table-cell">
												{formatCount(a.marked)}
											</TableCell>
										</TableRow>
									))}
								</TableBody>
							</Table>
						</section>
					))}
				</div>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ClipboardListIcon />
						</EmptyMedia>
						<EmptyTitle>No assessments yet</EmptyTitle>
						<EmptyDescription>
							{search.course
								? "Nothing has been added to this course's track."
								: "Add a course's first project or exercise with New assessment."}
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}
