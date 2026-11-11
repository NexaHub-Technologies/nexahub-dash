import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeftIcon } from "lucide-react";
import { FileList, UploadButton } from "#/components/dashboard/files";
import { TonePill } from "#/components/dashboard/status-badge";
import { useApply } from "#/components/dashboard/use-apply";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	KIND_LABEL,
	scoreText,
	WORK_LABEL,
	WORK_TONE,
	workState,
} from "#/lib/assessment-status";
import { MAX_FILE_LABEL } from "#/lib/files";
import { formatDate } from "#/lib/format";
import {
	finishSubmission,
	getMyWork,
	type MyFile,
	removeSubmission,
	startSubmission,
} from "#/lib/portal";

export const Route = createFileRoute("/portal/$id")({
	loader: async ({ params }) => {
		const found = await getMyWork({ data: params.id });
		// locked work has no page: its brief and files stay back until it opens
		if (!found || found.work.locked) throw notFound();
		return found;
	},
	component: WorkPage,
});

/* One open piece of work: the brief and its files to download, the
   student's own uploads, and the mark once there is one. */
function WorkPage() {
	const { work: w, files } = Route.useLoaderData();
	const apply = useApply();
	const marked = w.score !== null;
	const state = workState({
		locked: false,
		submitted: w.submitted_at !== null,
		score: w.score,
	});
	const href = (f: MyFile) =>
		`/files/${f.source === "brief" ? "brief" : "submission"}/${f.id}?work=${w.id}`;
	const brief = files.filter((f) => f.source === "brief");
	const mine = files.filter((f) => f.source === "mine");
	const fromTutor = files.filter((f) => f.source === "staff");

	return (
		<>
			<div className="flex flex-col items-start gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="-ml-2"
					nativeButton={false}
					render={<Link to="/portal" />}
				>
					<ArrowLeftIcon data-icon="inline-start" />
					My work
				</Button>
				<h1 className="text-3xl font-extrabold">{w.title}</h1>
				<p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
					{KIND_LABEL[w.kind]} · {w.course}
					<TonePill tone={WORK_TONE[state]}>{WORK_LABEL[state]}</TonePill>
					{w.due_on ? <span>Due {formatDate(w.due_on)}</span> : null}
				</p>
			</div>

			{marked ? (
				<Card>
					<CardHeader>
						<CardDescription>Your mark</CardDescription>
						<CardTitle className="font-heading text-4xl font-extrabold tabular-nums">
							{scoreText(w.score ?? 0, w.max_score)}
						</CardTitle>
					</CardHeader>
					{w.feedback || fromTutor.length ? (
						<CardContent className="flex flex-col gap-4">
							{w.feedback ? (
								<p className="text-sm break-words whitespace-pre-wrap">
									{w.feedback}
								</p>
							) : null}
							{fromTutor.length ? (
								<FileList
									empty=""
									files={fromTutor.map((f) => ({
										...f,
										note: "from your tutor",
										href: href(f),
									}))}
								/>
							) : null}
						</CardContent>
					) : null}
				</Card>
			) : null}

			<Card>
				<CardHeader>
					<CardTitle>What to do</CardTitle>
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					{w.brief ? (
						<p className="text-sm break-words whitespace-pre-wrap">{w.brief}</p>
					) : (
						<p className="text-sm text-muted-foreground">
							Your tutor hasn't written anything here. Check the files below.
						</p>
					)}
					{brief.length ? (
						<FileList
							empty=""
							files={brief.map((f) => ({ ...f, href: href(f) }))}
						/>
					) : null}
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>Your work</CardTitle>
					<CardDescription>
						{marked
							? "This has been marked, so it can't be changed."
							: `Upload your files here, up to ${MAX_FILE_LABEL} each. For a whole folder, zip it first.`}
					</CardDescription>
					{marked ? null : (
						<CardAction>
							<UploadButton
								label="Upload"
								variant="default"
								start={(file) =>
									startSubmission({ data: { id: w.id, ...file } })
								}
								finish={(file) =>
									finishSubmission({ data: { id: w.id, ...file } })
								}
							/>
						</CardAction>
					)}
				</CardHeader>
				<CardContent className="flex flex-col gap-4">
					<FileList
						empty="You haven't uploaded anything yet."
						files={mine.map((f) => ({
							...f,
							href: href(f),
							onRemove: marked
								? undefined
								: () => apply(removeSubmission({ data: f.id }), "File removed"),
						}))}
					/>
					{!marked && fromTutor.length ? (
						<FileList
							empty=""
							files={fromTutor.map((f) => ({
								...f,
								note: "from your tutor",
								href: href(f),
							}))}
						/>
					) : null}
				</CardContent>
			</Card>
		</>
	);
}
