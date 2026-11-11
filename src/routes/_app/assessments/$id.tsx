import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useNavigate,
} from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	LockIcon,
	LockOpenIcon,
	MoreHorizontalIcon,
	Trash2Icon,
	UsersIcon,
} from "lucide-react";
import { useState } from "react";
import {
	AssignButton,
	EditAssessmentButton,
	MarkDialog,
} from "#/components/dashboard/assessment-dialogs";
import { Panel, PanelEmpty } from "#/components/dashboard/blocks";
import { FileList, UploadButton } from "#/components/dashboard/files";
import { GradeBadge, TonePill } from "#/components/dashboard/status-badge";
import { useApply } from "#/components/dashboard/use-apply";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
} from "#/components/ui/alert-dialog";
import { Button } from "#/components/ui/button";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import {
	KIND_LABEL,
	WORK_LABEL,
	WORK_TONE,
	workState,
} from "#/lib/assessment-status";
import {
	type AssessmentDetail,
	type AssignmentRow,
	deleteAssessment,
	deleteFile,
	finishUpload,
	getAssessment,
	removeAssignment,
	setAssignmentsOpen,
	startUpload,
} from "#/lib/assessments";
import { formatDate } from "#/lib/format";

export const Route = createFileRoute("/_app/assessments/$id")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	loader: async ({ params }) => {
		const a = await getAssessment({ data: params.id });
		if (!a) throw notFound();
		return a;
	},
	component: AssessmentPage,
});

const studentFiles = (g: AssignmentRow) => g.files.filter((f) => !f.staff);

/* One piece of work: its brief and files, and every student it is assigned
   to, with the lock, their uploads and their grade. */
function AssessmentPage() {
	const a = Route.useLoaderData();
	const apply = useApply();
	const navigate = useNavigate();
	const [confirmDelete, setConfirmDelete] = useState(false);
	const locked = a.assignments.filter((g) => g.locked).length;
	const open = a.assignments.length - locked;

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-2xl font-bold">{a.title}</h1>
					<p className="text-sm text-muted-foreground">
						{KIND_LABEL[a.kind]} · {a.course}
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="ghost"
						size="sm"
						nativeButton={false}
						render={
							<Link to="/assessments" search={{ course: a.course_slug }} />
						}
					>
						<ArrowLeftIcon data-icon="inline-start" />
						All assessments
					</Button>
					<EditAssessmentButton assessment={a} />
					<Button
						variant="outline"
						size="sm"
						onClick={() => setConfirmDelete(true)}
					>
						<Trash2Icon data-icon="inline-start" />
						Delete
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
				<Panel
					title="Students"
					description={
						a.assignments.length
							? `${open} open · ${locked} locked`
							: "Not assigned to anyone yet"
					}
					action={
						<div className="flex flex-wrap justify-end gap-2">
							{locked ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										apply(
											setAssignmentsOpen({
												data: { assessmentId: a.id, open: true },
											}),
											"Opened for everyone",
										)
									}
								>
									<LockOpenIcon data-icon="inline-start" />
									Open for all
								</Button>
							) : null}
							{open ? (
								<Button
									variant="outline"
									size="sm"
									onClick={() =>
										apply(
											setAssignmentsOpen({
												data: { assessmentId: a.id, open: false },
											}),
											"Locked for everyone",
										)
									}
								>
									<LockIcon data-icon="inline-start" />
									Lock all
								</Button>
							) : null}
							<AssignButton assessment={a} />
						</div>
					}
				>
					{a.assignments.length ? (
						<Table>
							<TableHeader>
								<TableRow>
									<TableHead>Student</TableHead>
									<TableHead className="hidden sm:table-cell">Due</TableHead>
									<TableHead className="text-right">Grade</TableHead>
									<TableHead className="text-right">
										<span className="sr-only">Actions</span>
									</TableHead>
								</TableRow>
							</TableHeader>
							<TableBody>
								{a.assignments.map((g) => (
									<StudentRow key={g.id} assessment={a} assignment={g} />
								))}
							</TableBody>
						</Table>
					) : (
						<PanelEmpty Icon={UsersIcon}>
							{a.unassigned.length
								? "Assign it to students on the course to get started."
								: "Nobody is enrolled on this course yet."}
						</PanelEmpty>
					)}
				</Panel>

				<Panel
					title="Brief"
					action={
						<UploadButton
							label="Add files"
							start={(file) =>
								startUpload({ data: { target: "brief", id: a.id, ...file } })
							}
							finish={(file) =>
								finishUpload({ data: { target: "brief", id: a.id, ...file } })
							}
						/>
					}
				>
					{a.brief ? (
						<p className="text-sm break-words whitespace-pre-wrap">{a.brief}</p>
					) : (
						<p className="text-sm text-muted-foreground">
							No written brief. Add one with Edit.
						</p>
					)}
					<FileList
						empty="No files yet. Students download these once the work is open to them."
						files={a.files.map((f) => ({
							...f,
							href: `/files/brief/${f.id}`,
							onRemove: () =>
								apply(
									deleteFile({ data: { target: "brief", id: f.id } }),
									"File removed",
								),
						}))}
					/>
				</Panel>
			</div>

			<AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Delete “{a.title}”?</AlertDialogTitle>
						<AlertDialogDescription>
							{a.assignments.length
								? `It is removed for all ${a.assignments.length} students it is assigned to, with their uploads and grades. This can't be undone.`
								: "Its brief and files are removed. This can't be undone."}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep it</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							onClick={async () => {
								const ok = await apply(
									deleteAssessment({ data: a.id }),
									"Assessment deleted",
								);
								if (ok) {
									await navigate({
										to: "/assessments",
										search: { course: a.course_slug },
									});
								}
							}}
						>
							Delete
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function StudentRow({
	assessment: a,
	assignment: g,
}: {
	assessment: AssessmentDetail;
	assignment: AssignmentRow;
}) {
	const apply = useApply();
	const [marking, setMarking] = useState(false);
	const [removing, setRemoving] = useState(false);
	const uploads = studentFiles(g).length;
	const state = workState({
		locked: g.locked,
		submitted: uploads > 0,
		grade: g.grade,
	});

	return (
		<TableRow>
			<TableCell className="whitespace-normal">
				<span className="flex flex-col items-start gap-1">
					<Link
						to="/students/$id"
						params={{ id: g.student_id }}
						className="font-medium hover:underline"
					>
						{g.full_name}
					</Link>
					<span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
						<TonePill tone={WORK_TONE[state]}>{WORK_LABEL[state]}</TonePill>
						{uploads
							? `${uploads} ${uploads === 1 ? "file" : "files"} uploaded`
							: null}
					</span>
				</span>
			</TableCell>
			<TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
				{g.due_on ? formatDate(g.due_on) : "—"}
			</TableCell>
			<TableCell className="text-right">
				<GradeBadge grade={g.grade} />
			</TableCell>
			<TableCell className="text-right">
				<div className="flex justify-end gap-1">
					<Button variant="outline" size="sm" onClick={() => setMarking(true)}>
						{g.grade === null ? "Grade" : "Review"}
					</Button>
					<DropdownMenu>
						<DropdownMenuTrigger
							render={
								<Button
									variant="ghost"
									size="icon-sm"
									aria-label={`More for ${g.full_name}`}
								>
									<MoreHorizontalIcon />
								</Button>
							}
						/>
						<DropdownMenuContent align="end">
							<DropdownMenuGroup>
								<DropdownMenuItem
									onClick={() =>
										apply(
											setAssignmentsOpen({
												data: {
													assessmentId: a.id,
													assignmentIds: [g.id],
													open: g.locked,
												},
											}),
											g.locked
												? `Opened for ${g.full_name}`
												: `Locked for ${g.full_name}`,
										)
									}
								>
									{g.locked ? <LockOpenIcon /> : <LockIcon />}
									{g.locked ? "Open for this student" : "Lock for this student"}
								</DropdownMenuItem>
							</DropdownMenuGroup>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setRemoving(true)}
								>
									<Trash2Icon />
									Remove from this student
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</DropdownMenuContent>
					</DropdownMenu>
				</div>
				<MarkDialog
					assessment={a}
					assignment={g}
					open={marking}
					onOpenChange={setMarking}
				/>
				<AlertDialog open={removing} onOpenChange={setRemoving}>
					<AlertDialogContent>
						<AlertDialogHeader>
							<AlertDialogTitle>
								Remove this work from {g.full_name}?
							</AlertDialogTitle>
							<AlertDialogDescription>
								Their uploads and grade for “{a.title}” are deleted. This can't
								be undone.
							</AlertDialogDescription>
						</AlertDialogHeader>
						<AlertDialogFooter>
							<AlertDialogCancel>Keep it</AlertDialogCancel>
							<AlertDialogAction
								variant="destructive"
								onClick={() =>
									apply(removeAssignment({ data: g.id }), "Removed")
								}
							>
								Remove
							</AlertDialogAction>
						</AlertDialogFooter>
					</AlertDialogContent>
				</AlertDialog>
			</TableCell>
		</TableRow>
	);
}
