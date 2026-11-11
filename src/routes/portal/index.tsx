import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronRightIcon, ClipboardListIcon, LockIcon } from "lucide-react";
import { TonePill } from "#/components/dashboard/status-badge";
import { Card } from "#/components/ui/card";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import {
	KIND_LABEL,
	scoreText,
	WORK_LABEL,
	WORK_TONE,
	workState,
} from "#/lib/assessment-status";
import { formatDate } from "#/lib/format";
import { listMyWork, type MyWork } from "#/lib/portal";

export const Route = createFileRoute("/portal/")({
	loader: () => listMyWork(),
	component: MyWorkPage,
});

const stateOf = (w: MyWork) =>
	workState({
		locked: w.locked,
		submitted: w.submitted_at !== null,
		score: w.score,
	});

/* The student's projects and exercises, course by course, in the order
   they come on the course. Locked work shows its title only. */
function MyWorkPage() {
	const work = Route.useLoaderData();
	const { student } = Route.useRouteContext();

	const courses: { course: string; work: MyWork[] }[] = [];
	for (const w of work) {
		const last = courses.at(-1);
		if (last?.course === w.course) last.work.push(w);
		else courses.push({ course: w.course, work: [w] });
	}

	return (
		<>
			<div className="flex flex-col gap-1">
				<h1 className="text-3xl font-extrabold">My work</h1>
				<p className="text-sm text-muted-foreground">
					Hello {student.full_name.split(/\s+/)[0]}. Your projects and exercises
					are here: download what you need, upload your work, and see your
					marks.
				</p>
			</div>

			{courses.length ? (
				courses.map((c) => (
					<section key={c.course} className="flex flex-col gap-2">
						<h2 className="text-lg font-bold">{c.course}</h2>
						<Card className="gap-0 py-0">
							<ul className="flex flex-col divide-y">
								{c.work.map((w) => (
									<WorkRow key={w.id} work={w} />
								))}
							</ul>
						</Card>
					</section>
				))
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<ClipboardListIcon />
						</EmptyMedia>
						<EmptyTitle>Nothing yet</EmptyTitle>
						<EmptyDescription>
							When your tutor assigns you a project or an exercise, it will
							appear here.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</>
	);
}

function WorkRow({ work: w }: { work: MyWork }) {
	const state = stateOf(w);
	const body = (
		<>
			<span className="flex min-w-0 flex-1 flex-col gap-1">
				<span className="truncate font-medium">{w.title}</span>
				<span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{KIND_LABEL[w.kind]}
					<TonePill tone={WORK_TONE[state]}>{WORK_LABEL[state]}</TonePill>
					{state === "locked" ? "Your tutor will open this for you" : null}
					{state !== "locked" && state !== "marked" && w.due_on
						? `Due ${formatDate(w.due_on)}`
						: null}
				</span>
			</span>
			{w.score !== null ? (
				<span className="shrink-0 font-heading text-lg font-extrabold tabular-nums">
					{scoreText(w.score, w.max_score)}
				</span>
			) : null}
			{w.locked ? (
				<LockIcon
					aria-hidden
					className="size-4 shrink-0 text-muted-foreground"
				/>
			) : (
				<ChevronRightIcon
					aria-hidden
					className="size-4 shrink-0 text-muted-foreground"
				/>
			)}
		</>
	);
	const cls = "flex items-center gap-3 px-4 py-3.5";
	return (
		<li>
			{w.locked ? (
				<div className={cls}>{body}</div>
			) : (
				<Link
					to="/portal/$id"
					params={{ id: w.id }}
					className={`${cls} transition-colors hover:bg-muted`}
				>
					{body}
				</Link>
			)}
		</li>
	);
}
