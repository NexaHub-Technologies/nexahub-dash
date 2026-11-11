import { useNavigate } from "@tanstack/react-router";
import { PencilIcon, PlusIcon, UserPlusIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "#/components/ui/dialog";
import {
	Field,
	FieldDescription,
	FieldGroup,
	FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#/components/ui/select";
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import {
	type AssessmentKind,
	isKind,
	KIND_LABEL,
} from "#/lib/assessment-status";
import {
	type AssessmentDetail,
	type AssignmentRow,
	assignStudents,
	createAssessment,
	deleteFile,
	finishUpload,
	markAssignment,
	startUpload,
	updateAssessment,
} from "#/lib/assessments";
import { STATUS_LABEL } from "#/lib/status";
import { FileList, UploadButton } from "./files";
import { useApply } from "./use-apply";

/* The assessment actions: typing a piece of work into a course's track,
   changing it, assigning it, and marking one student's work. The database
   decides what is allowed (a score above the maximum, a student from
   another course) and its reason is shown when it refuses. */

const KINDS: { label: string; value: AssessmentKind }[] = [
	{ label: KIND_LABEL.project, value: "project" },
	{ label: KIND_LABEL.exercise, value: "exercise" },
];

function KindField({
	id,
	value,
	onChange,
}: {
	id: string;
	value: AssessmentKind;
	onChange: (k: AssessmentKind) => void;
}) {
	return (
		<Field>
			<FieldLabel htmlFor={id}>Type</FieldLabel>
			<Select
				items={KINDS}
				value={value}
				onValueChange={(v) => onChange(isKind(v) ? v : "project")}
			>
				<SelectTrigger id={id}>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{KINDS.map((k) => (
							<SelectItem key={k.value} value={k.value}>
								{k.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
		</Field>
	);
}

function TitleBriefScore({
	title = "",
	brief = "",
	maxScore = 100,
}: {
	title?: string;
	brief?: string;
	maxScore?: number;
}) {
	return (
		<>
			<Field>
				<FieldLabel htmlFor="as-title">Title</FieldLabel>
				<Input
					id="as-title"
					name="title"
					defaultValue={title}
					required
					maxLength={160}
				/>
			</Field>
			<Field>
				<FieldLabel htmlFor="as-brief">Brief</FieldLabel>
				<Textarea
					id="as-brief"
					name="brief"
					defaultValue={brief}
					maxLength={5000}
					rows={5}
				/>
				<FieldDescription>
					What the student has to do. They see it once the work is open to them.
					Files are added after saving.
				</FieldDescription>
			</Field>
			<Field>
				<FieldLabel htmlFor="as-max">Marked out of</FieldLabel>
				<Input
					id="as-max"
					name="maxScore"
					type="number"
					inputMode="numeric"
					min={1}
					max={1000}
					step={1}
					required
					defaultValue={maxScore}
				/>
			</Field>
		</>
	);
}

/* Types a new project or exercise into a course's track, then opens it so
   files can be added. */
export function NewAssessmentButton({
	courses,
	course,
}: {
	courses: { slug: string; title: string }[];
	course?: string;
}) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [slug, setSlug] = useState(course ?? "");
	const [kind, setKind] = useState<AssessmentKind>("project");

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const f = new FormData(ev.currentTarget);
		setPending(true);
		const r = await createAssessment({
			data: {
				course: slug,
				kind,
				title: f.get("title"),
				brief: f.get("brief"),
				maxScore: Number(f.get("maxScore")),
				assign: f.get("assign") === "on",
			},
		});
		setPending(false);
		if (!r.ok) {
			toast.add({ title: "Not added", description: r.message, type: "error" });
			return;
		}
		toast.add({
			title: `${KIND_LABEL[kind]} added`,
			description: r.note,
			type: "success",
		});
		setOpen(false);
		await navigate({ to: "/assessments/$id", params: { id: r.data.id } });
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button>
						<PlusIcon data-icon="inline-start" />
						New assessment
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>New assessment</DialogTitle>
						<DialogDescription>
							A project or exercise on a course's track.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field>
							<FieldLabel htmlFor="as-course">Course</FieldLabel>
							<Select
								items={courses.map((c) => ({ label: c.title, value: c.slug }))}
								value={slug}
								onValueChange={(v) => setSlug(String(v ?? ""))}
							>
								<SelectTrigger id="as-course">
									<SelectValue placeholder="Choose a course" />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										{courses.map((c) => (
											<SelectItem key={c.slug} value={c.slug}>
												{c.title}
											</SelectItem>
										))}
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<KindField id="as-kind" value={kind} onChange={setKind} />
						<TitleBriefScore />
						<label className="flex items-start gap-2 text-sm">
							<input
								type="checkbox"
								name="assign"
								defaultChecked
								className="mt-0.5 size-4 accent-primary"
							/>
							<span>
								Assign to everyone active on the course now
								<span className="block text-xs text-muted-foreground">
									{kind === "project"
										? "A project starts locked: students see its title until you open it."
										: "An exercise is open to students straight away."}
								</span>
							</span>
						</label>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending || !slug}>
							{pending && <Spinner data-icon="inline-start" />}
							Add
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function EditAssessmentButton({
	assessment: a,
}: {
	assessment: AssessmentDetail;
}) {
	const apply = useApply();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [kind, setKind] = useState<AssessmentKind>(a.kind);

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const f = new FormData(ev.currentTarget);
		setPending(true);
		const ok = await apply(
			updateAssessment({
				data: {
					id: a.id,
					kind,
					title: f.get("title"),
					brief: f.get("brief"),
					maxScore: Number(f.get("maxScore")),
					position: Number(f.get("position")),
				},
			}),
			"Assessment saved",
		);
		setPending(false);
		if (ok) setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm">
						<PencilIcon data-icon="inline-start" />
						Edit
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>Edit assessment</DialogTitle>
						<DialogDescription>{a.course}</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<KindField id="as-kind" value={kind} onChange={setKind} />
						<TitleBriefScore
							title={a.title}
							brief={a.brief}
							maxScore={a.max_score}
						/>
						<Field>
							<FieldLabel htmlFor="as-position">Order on the track</FieldLabel>
							<Input
								id="as-position"
								name="position"
								type="number"
								inputMode="numeric"
								min={0}
								max={9999}
								step={1}
								required
								defaultValue={a.position}
							/>
							<FieldDescription>
								Lower numbers come first in the course's list.
							</FieldDescription>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/* Gives the work to students on the course who don't have it yet. */
export function AssignButton({
	assessment: a,
}: {
	assessment: AssessmentDetail;
}) {
	const apply = useApply();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const f = new FormData(ev.currentTarget);
		setPending(true);
		const ok = await apply(
			assignStudents({
				data: {
					assessmentId: a.id,
					enrolmentIds: f.getAll("enrolment"),
					open: f.get("open") === "on",
					dueOn: f.get("dueOn"),
				},
			}),
			"Assigned",
		);
		setPending(false);
		if (ok) setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm" disabled={!a.unassigned.length}>
						<UserPlusIcon data-icon="inline-start" />
						Assign students
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>Assign “{a.title}”</DialogTitle>
						<DialogDescription>
							Students on {a.course} who don't have it yet.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<fieldset className="flex max-h-64 flex-col gap-2 overflow-y-auto rounded-lg border p-3">
							<legend className="sr-only">Students</legend>
							{a.unassigned.map((u) => (
								<label
									key={u.enrolment_id}
									className="flex items-center gap-2 text-sm"
								>
									<input
										type="checkbox"
										name="enrolment"
										value={u.enrolment_id}
										defaultChecked={u.status === "active"}
										className="size-4 accent-primary"
									/>
									<span className="flex-1">{u.full_name}</span>
									<span className="text-xs text-muted-foreground">
										{STATUS_LABEL[u.status]}
									</span>
								</label>
							))}
						</fieldset>
						<Field>
							<FieldLabel htmlFor="assign-due">Due date (optional)</FieldLabel>
							<Input id="assign-due" name="dueOn" type="date" />
						</Field>
						<label className="flex items-start gap-2 text-sm">
							<input
								type="checkbox"
								name="open"
								defaultChecked={a.kind === "exercise"}
								className="mt-0.5 size-4 accent-primary"
							/>
							<span>
								Open it to them now
								<span className="block text-xs text-muted-foreground">
									Left unticked, it is locked: they see the title only until you
									open it.
								</span>
							</span>
						</label>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							Assign
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/* One student's work: what they uploaded, the score and feedback, the due
   date, and files added for them or handed back. */
export function MarkDialog({
	assessment: a,
	assignment: g,
	open,
	onOpenChange,
}: {
	assessment: AssessmentDetail;
	assignment: AssignmentRow;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const apply = useApply();
	const [pending, setPending] = useState(false);

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const f = new FormData(ev.currentTarget);
		setPending(true);
		const ok = await apply(
			markAssignment({
				data: {
					id: g.id,
					score: f.get("score"),
					feedback: f.get("feedback"),
					dueOn: f.get("dueOn"),
				},
			}),
			`Saved for ${g.full_name}`,
		);
		setPending(false);
		if (ok) onOpenChange(false);
	}

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>{g.full_name}</DialogTitle>
						<DialogDescription>{a.title}</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<div className="flex flex-col gap-2">
							<div className="flex items-center justify-between gap-3">
								<span className="text-sm font-medium">Their files</span>
								<UploadButton
									label="Add a file"
									start={(file) =>
										startUpload({
											data: { target: "submission", id: g.id, ...file },
										})
									}
									finish={(file) =>
										finishUpload({
											data: { target: "submission", id: g.id, ...file },
										})
									}
								/>
							</div>
							<FileList
								empty="Nothing uploaded yet."
								files={g.files.map((f) => ({
									...f,
									note: f.staff ? `added by ${f.staff}` : "uploaded by student",
									href: `/files/submission/${f.id}`,
									onRemove: () =>
										apply(
											deleteFile({ data: { target: "submission", id: f.id } }),
											"File removed",
										),
								}))}
							/>
						</div>
						<div className="grid gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="mark-score">
									Score (out of {a.max_score})
								</FieldLabel>
								<Input
									id="mark-score"
									name="score"
									type="number"
									inputMode="numeric"
									min={0}
									max={a.max_score}
									step={1}
									defaultValue={g.score ?? ""}
								/>
								<FieldDescription>Blank means not yet marked.</FieldDescription>
							</Field>
							<Field>
								<FieldLabel htmlFor="mark-due">Due date</FieldLabel>
								<Input
									id="mark-due"
									name="dueOn"
									type="date"
									defaultValue={g.due_on ?? ""}
								/>
							</Field>
						</div>
						<Field>
							<FieldLabel htmlFor="mark-feedback">Feedback</FieldLabel>
							<Textarea
								id="mark-feedback"
								name="feedback"
								defaultValue={g.feedback ?? ""}
								maxLength={4000}
								rows={4}
							/>
							<FieldDescription>
								The student sees the score and feedback in their portal.
							</FieldDescription>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Close</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							Save
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
