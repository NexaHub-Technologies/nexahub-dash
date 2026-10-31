import {
	createFileRoute,
	Link,
	notFound,
	redirect,
} from "@tanstack/react-router";
import {
	ArrowLeftIcon,
	ChevronDownIcon,
	DownloadIcon,
	PencilIcon,
} from "lucide-react";
import { useState } from "react";
import {
	AddInvoiceButton,
	InvoiceActions,
} from "#/components/dashboard/fee-dialogs";
import { StatusBadge } from "#/components/dashboard/status-badge";
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
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from "#/components/ui/collapsible";
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
import { Field, FieldGroup, FieldLabel } from "#/components/ui/field";
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
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { Textarea } from "#/components/ui/textarea";
import { formatDate, formatNaira } from "#/lib/format";
import {
	type EnrolmentStatus,
	isStatus,
	STATUS_LABEL,
	STATUSES,
} from "#/lib/status";
import {
	getStudent,
	type StudentDetail,
	setEnrolmentStatus,
	updateStudent,
} from "#/lib/students";
import { cn } from "#/lib/utils";

export const Route = createFileRoute("/_app/students/$id")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	loader: async ({ params }) => {
		const s = await getStudent({ data: params.id });
		if (!s) throw notFound();
		return s;
	},
	component: StudentPage,
});

const yesNo = (v: string | boolean | undefined) =>
	typeof v === "boolean" ? (v ? "Yes" : "No") : (v ?? "");

function StudentPage() {
	const s = Route.useLoaderData();
	const courseTitle = (slug: string) =>
		s.enrolments.find((e) => e.course_slug === slug)?.course ?? slug;
	const owed = s.invoices.reduce(
		(n, i) => n + (i.status === "open" ? Math.max(i.balance_kobo, 0) : 0),
		0,
	);

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<h1 className="text-2xl font-bold">{s.full_name}</h1>
					<p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						{s.enrolments.map((e) => (
							<StatusBadge key={e.id} status={e.status} />
						))}
						<span>Student since {formatDate(s.created_at)}</span>
					</p>
				</div>
				<div className="flex flex-wrap gap-2">
					<Button
						variant="ghost"
						size="sm"
						nativeButton={false}
						render={<Link to="/students" />}
					>
						<ArrowLeftIcon data-icon="inline-start" />
						All students
					</Button>
					<Button
						variant="outline"
						size="sm"
						nativeButton={false}
						render={
							// a file download, not a page: the browser fetches it directly
							// biome-ignore lint/a11y/useAnchorContent: Base UI renders the button's icon and label inside this link
							<a
								href={`/students/${s.id}/record.pdf`}
								download
								aria-label="Download PDF record"
							/>
						}
					>
						<DownloadIcon data-icon="inline-start" />
						Download PDF
					</Button>
				</div>
			</div>

			<div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_24rem]">
				<div className="flex min-w-0 flex-col gap-5">
					<Card>
						<CardHeader>
							<CardTitle>Courses</CardTitle>
							<CardDescription>
								Their status on each course. Paying the first instalment makes
								an awaiting student active.
							</CardDescription>
						</CardHeader>
						<CardContent className="flex flex-col divide-y">
							{s.enrolments.map((e) => (
								<EnrolmentRow key={e.id} student={s} enrolment={e} />
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Fees</CardTitle>
							<CardDescription>
								{owed > 0
									? `${formatNaira(owed)} outstanding`
									: "Nothing outstanding"}
							</CardDescription>
							<CardAction>
								<AddInvoiceButton
									enrolments={s.enrolments.map((e) => ({
										id: e.id,
										course: e.course,
									}))}
								/>
							</CardAction>
						</CardHeader>
						<CardContent className="flex flex-col gap-4">
							{s.invoices.length ? (
								<Table>
									<TableHeader>
										<TableRow>
											<TableHead>Invoice</TableHead>
											<TableHead className="text-right">Amount</TableHead>
											<TableHead className="text-right">Paid</TableHead>
											<TableHead className="text-right">Balance</TableHead>
											<TableHead className="text-right">
												<span className="sr-only">Actions</span>
											</TableHead>
										</TableRow>
									</TableHeader>
									<TableBody>
										{s.invoices.map((i) => (
											<TableRow key={i.id}>
												<TableCell>
													<span className="flex flex-col">
														<span className="font-medium">{i.description}</span>
														<span className="text-xs text-muted-foreground">
															Due {formatDate(i.due_on)} ·{" "}
															{i.status === "void" ? "voided" : i.status}
														</span>
													</span>
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatNaira(i.amount_kobo)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatNaira(i.paid_kobo)}
												</TableCell>
												<TableCell className="text-right tabular-nums">
													{formatNaira(Math.max(i.balance_kobo, 0))}
												</TableCell>
												<TableCell className="text-right">
													<InvoiceActions
														invoice={i}
														studentName={s.full_name}
														phone={s.phone}
														course={
															s.enrolments.find((e) => e.id === i.enrolment_id)
																?.course ?? ""
														}
													/>
												</TableCell>
											</TableRow>
										))}
									</TableBody>
								</Table>
							) : (
								<p className="text-sm text-muted-foreground">No invoices.</p>
							)}
							{s.payments.length ? (
								<div className="flex flex-col gap-2">
									<h3 className="text-sm font-semibold">Payments</h3>
									<ul className="flex flex-col divide-y rounded-lg border text-sm">
										{s.payments.map((p) => (
											<li
												key={p.id}
												className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
											>
												<span className="flex flex-col">
													<span className="font-medium tabular-nums">
														{formatNaira(p.amount_kobo)}
													</span>
													<span className="text-xs text-muted-foreground">
														{p.method === "cash"
															? "Cash"
															: p.method === "transfer"
																? "Transfer"
																: "Paystack"}{" "}
														· {p.reference}
													</span>
												</span>
												<span className="text-xs text-muted-foreground">
													{formatDate(p.paid_at)}
													{p.recorded_by ? ` · ${p.recorded_by}` : ""}
												</span>
											</li>
										))}
									</ul>
								</div>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>Status history</CardTitle>
						</CardHeader>
						<CardContent>
							{s.history.length ? (
								<ol className="flex flex-col gap-3 text-sm">
									{s.history.map((h) => (
										<li
											key={`${h.enrolment_id}-${h.at}-${h.to_status}`}
											className="flex flex-wrap items-center gap-2"
										>
											<span className="w-28 shrink-0 text-muted-foreground">
												{formatDate(h.at)}
											</span>
											<span className="text-muted-foreground">
												{courseTitle(h.course_slug)}:
											</span>
											{h.from_status && isStatus(h.from_status) ? (
												<>
													<StatusBadge status={h.from_status} />
													<span aria-hidden>→</span>
												</>
											) : (
												<span className="text-muted-foreground">
													enrolled as
												</span>
											)}
											{isStatus(h.to_status) ? (
												<StatusBadge status={h.to_status} />
											) : (
												h.to_status
											)}
											{h.actor_name ? (
												<span className="text-muted-foreground">
													by {h.actor_name}
												</span>
											) : null}
										</li>
									))}
								</ol>
							) : (
								<p className="text-sm text-muted-foreground">No changes yet.</p>
							)}
						</CardContent>
					</Card>
				</div>

				<div className="flex min-w-0 flex-col gap-5">
					<DetailsCard student={s} />
					{s.application ? (
						<Card>
							<Collapsible>
								<CardHeader>
									<CardTitle>Application answers</CardTitle>
									<CardAction>
										<CollapsibleTrigger
											render={
												<Button variant="ghost" size="sm" className="group">
													Show
													<ChevronDownIcon
														data-icon="inline-end"
														className="transition-transform group-data-panel-open:rotate-180"
													/>
												</Button>
											}
										/>
									</CardAction>
								</CardHeader>
								<CollapsibleContent>
									<CardContent>
										<dl className="grid gap-3 pt-4 text-sm">
											{(
												[
													[
														"Applied",
														formatDate(String(s.application.applied)),
													],
													["Training mode", s.application.mode],
													["Has experience", s.application.has_experience],
													["Experience", s.application.experience_detail],
													["Has a laptop", s.application.has_laptop],
													["Heard about us from", s.application.heard_from],
													["Can commit", s.application.can_commit],
													[
														"Updates by email and SMS",
														s.application.notify_consent,
													],
													["Comments", s.application.comments],
												] as [string, string | boolean][]
											)
												.filter(([, v]) => v !== "")
												.map(([label, v]) => (
													<div key={label} className="grid gap-0.5">
														<dt className="text-muted-foreground">{label}</dt>
														<dd className="whitespace-pre-wrap break-words">
															{yesNo(v)}
														</dd>
													</div>
												))}
										</dl>
									</CardContent>
								</CollapsibleContent>
							</Collapsible>
						</Card>
					) : null}
				</div>
			</div>
		</div>
	);
}

function EnrolmentRow({
	student,
	enrolment: e,
}: {
	student: StudentDetail;
	enrolment: StudentDetail["enrolments"][number];
}) {
	const apply = useApply();
	const [confirm, setConfirm] = useState<EnrolmentStatus | null>(null);
	const items = STATUSES.map((v) => ({ label: STATUS_LABEL[v], value: v }));

	const change = (status: EnrolmentStatus) =>
		apply(
			setEnrolmentStatus({ data: { enrolmentId: e.id, status } }),
			`${student.full_name} is now ${STATUS_LABEL[status].toLowerCase()} on ${e.course}`,
		);

	return (
		<div className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
			<div className="flex flex-col">
				<span className="font-medium">{e.course}</span>
				<span className="text-xs text-muted-foreground">
					{e.starts_on
						? `Starts ${formatDate(e.starts_on)}`
						: `Enrolled ${formatDate(e.created_at)}`}
				</span>
			</div>
			<Select
				items={items}
				value={e.status}
				onValueChange={(v) => {
					if (!isStatus(v) || v === e.status) return;
					if (v === "withdrawn" || v === "completed") setConfirm(v);
					else change(v);
				}}
			>
				<SelectTrigger
					size="sm"
					aria-label={`Status on ${e.course}`}
					className="min-w-44"
				>
					<SelectValue />
				</SelectTrigger>
				<SelectContent>
					<SelectGroup>
						{items.map((i) => (
							<SelectItem key={i.value} value={i.value}>
								{i.label}
							</SelectItem>
						))}
					</SelectGroup>
				</SelectContent>
			</Select>
			<AlertDialog
				open={confirm !== null}
				onOpenChange={(o) => !o && setConfirm(null)}
			>
				<AlertDialogContent size="sm">
					<AlertDialogHeader>
						<AlertDialogTitle>
							Mark {student.full_name} as{" "}
							{confirm ? STATUS_LABEL[confirm].toLowerCase() : ""}?
						</AlertDialogTitle>
						<AlertDialogDescription>
							{confirm === "withdrawn"
								? `They leave ${e.course}. Their record and payments stay, and you can change this back.`
								: `They finish ${e.course}. You can change this back if it was a mistake.`}
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
						<AlertDialogAction
							variant={confirm === "withdrawn" ? "destructive" : "default"}
							onClick={() => {
								if (confirm) change(confirm);
								setConfirm(null);
							}}
						>
							Confirm
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}

function DetailsCard({ student: s }: { student: StudentDetail }) {
	const apply = useApply();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);

	const rows: [string, string | null][] = [
		["Email", s.email],
		["Phone", s.phone],
		["Gender", s.gender],
		["Employment", s.employment],
		["Date of birth", s.date_of_birth ? formatDate(s.date_of_birth) : null],
		["Address", s.address],
	];

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const f = new FormData(ev.currentTarget);
		setPending(true);
		const ok = await apply(
			updateStudent({
				data: {
					id: s.id,
					full_name: f.get("full_name"),
					email: f.get("email"),
					phone: f.get("phone"),
					gender: f.get("gender"),
					employment: f.get("employment"),
					address: f.get("address"),
					date_of_birth: f.get("date_of_birth"),
				},
			}),
			"Details saved",
		);
		setPending(false);
		if (ok) setOpen(false);
	}

	return (
		<Card>
			<CardHeader>
				<CardTitle>Details</CardTitle>
				<CardAction>
					<Dialog open={open} onOpenChange={setOpen}>
						<DialogTrigger
							render={
								<Button variant="ghost" size="sm">
									<PencilIcon data-icon="inline-start" />
									Edit
								</Button>
							}
						/>
						<DialogContent>
							<form onSubmit={onSubmit} className="flex flex-col gap-6">
								<DialogHeader>
									<DialogTitle>Edit {s.full_name}'s details</DialogTitle>
									<DialogDescription>
										Changes are kept in the audit log.
									</DialogDescription>
								</DialogHeader>
								<FieldGroup>
									<Field>
										<FieldLabel htmlFor="st-name">Full name</FieldLabel>
										<Input
											id="st-name"
											name="full_name"
											defaultValue={s.full_name}
											required
											maxLength={120}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="st-email">Email</FieldLabel>
										<Input
											id="st-email"
											name="email"
											type="email"
											defaultValue={s.email}
											required
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="st-phone">Phone</FieldLabel>
										<Input
											id="st-phone"
											name="phone"
											type="tel"
											defaultValue={s.phone ?? ""}
											maxLength={40}
										/>
									</Field>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field>
											<FieldLabel htmlFor="st-gender">Gender</FieldLabel>
											<Input
												id="st-gender"
												name="gender"
												defaultValue={s.gender ?? ""}
												maxLength={40}
											/>
										</Field>
										<Field>
											<FieldLabel htmlFor="st-employment">
												Employment
											</FieldLabel>
											<Input
												id="st-employment"
												name="employment"
												defaultValue={s.employment ?? ""}
												maxLength={40}
											/>
										</Field>
									</div>
									<Field>
										<FieldLabel htmlFor="st-dob">Date of birth</FieldLabel>
										<Input
											id="st-dob"
											name="date_of_birth"
											type="date"
											defaultValue={s.date_of_birth ?? ""}
										/>
									</Field>
									<Field>
										<FieldLabel htmlFor="st-address">Address</FieldLabel>
										<Textarea
											id="st-address"
											name="address"
											defaultValue={s.address ?? ""}
											maxLength={300}
										/>
									</Field>
								</FieldGroup>
								<DialogFooter>
									<DialogClose
										render={<Button variant="ghost">Cancel</Button>}
									/>
									<Button type="submit" disabled={pending}>
										{pending && <Spinner data-icon="inline-start" />}
										Save
									</Button>
								</DialogFooter>
							</form>
						</DialogContent>
					</Dialog>
				</CardAction>
			</CardHeader>
			<CardContent>
				<dl className="grid gap-3 text-sm">
					{rows.map(([label, value]) => (
						<div key={label} className="grid gap-0.5">
							<dt className="text-muted-foreground">{label}</dt>
							<dd
								className={cn("break-words", !value && "text-muted-foreground")}
							>
								{value || "—"}
							</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}
