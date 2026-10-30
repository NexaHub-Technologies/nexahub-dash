import {
	createFileRoute,
	Link,
	notFound,
	redirect,
	useNavigate,
	useRouter,
} from "@tanstack/react-router";
import { ArrowLeftIcon, CheckIcon, XIcon } from "lucide-react";
import { useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import {
	AlertDialog,
	AlertDialogAction,
	AlertDialogCancel,
	AlertDialogContent,
	AlertDialogDescription,
	AlertDialogFooter,
	AlertDialogHeader,
	AlertDialogTitle,
	AlertDialogTrigger,
} from "#/components/ui/alert-dialog";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#/components/ui/card";
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
import { Spinner } from "#/components/ui/spinner";
import { Textarea } from "#/components/ui/textarea";
import { toast } from "#/components/ui/toast";
import {
	type ApplicationDetail,
	approveApplication,
	declineApplication,
	getApplication,
} from "#/lib/applications";
import { formatDate, formatNaira, parseNaira, timeAgo } from "#/lib/format";
import { APPLICATION_TONE } from "./index";

export const Route = createFileRoute("/_app/applications/$id")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	loader: async ({ params }) => {
		const a = await getApplication({ data: params.id });
		if (!a) throw notFound();
		return a;
	},
	component: ApplicationPage,
});

const yesNo = (b: boolean) => (b ? "Yes" : "No");

/* today in Lagos, as the yyyy-mm-dd a date input wants */
const todayInLagos = () =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
		new Date(),
	);

function ApplicationPage() {
	const a = Route.useLoaderData();

	const sections: { title: string; rows: [string, string][] }[] = [
		{
			title: "Personal details",
			rows: [
				["Full name", a.full_name],
				["Email", a.email],
				["Phone", a.phone],
				["Gender", a.gender],
				["Employment", a.employment],
			],
		},
		{
			title: "Course",
			rows: [
				["Course", a.course],
				["Training mode", a.mode],
			],
		},
		{
			title: "Background",
			rows: [
				["Has experience", yesNo(a.has_experience)],
				...(a.experience_detail
					? ([["Experience", a.experience_detail]] as [string, string][])
					: []),
				["Has a laptop", yesNo(a.has_laptop)],
				["Heard about us from", a.heard_from],
			],
		},
		{
			title: "Commitment",
			rows: [
				["Can commit to the schedule", yesNo(a.can_commit)],
				["Updates by email and SMS", yesNo(a.notify_consent)],
				...(a.comments
					? ([["Comments", a.comments]] as [string, string][])
					: []),
			],
		},
	];

	return (
		<div className="flex flex-col gap-5">
			<div className="flex flex-wrap items-start justify-between gap-3">
				<div className="flex flex-col gap-1">
					<div className="flex flex-wrap items-center gap-2">
						<h1 className="text-2xl font-bold">{a.full_name}</h1>
						<Badge variant={APPLICATION_TONE[a.status]} className="capitalize">
							{a.status}
						</Badge>
					</div>
					<p className="text-sm text-muted-foreground">
						Applied for {a.course} · {timeAgo(a.created_at)}
					</p>
				</div>
				<Button
					variant="ghost"
					size="sm"
					nativeButton={false}
					render={<Link to="/applications" />}
				>
					<ArrowLeftIcon data-icon="inline-start" />
					All applications
				</Button>
			</div>

			{a.status === "new" ? (
				<Card>
					<CardHeader>
						<CardTitle>Review</CardTitle>
						<CardDescription>
							Approving enrols {a.full_name.split(" ")[0]} in {a.course} and
							invoices the fee. They become active once they pay.
						</CardDescription>
					</CardHeader>
					<CardContent className="flex flex-wrap gap-2">
						<ApproveDialog application={a} />
						<DeclineDialog application={a} />
					</CardContent>
				</Card>
			) : (
				<Alert>
					{a.status === "approved" ? <CheckIcon /> : <XIcon />}
					<AlertTitle className="capitalize">
						{a.status}
						{a.reviewer ? ` by ${a.reviewer}` : ""}
						{a.reviewed_at ? `, ${formatDate(a.reviewed_at)}` : ""}
					</AlertTitle>
					<AlertDescription>
						{a.status === "declined" ? (
							a.decline_reason || "No reason given."
						) : a.student_id ? (
							<Link
								to="/students/$id"
								params={{ id: a.student_id }}
								className="underline underline-offset-4"
							>
								Open their registry record
							</Link>
						) : (
							"Enrolled."
						)}
					</AlertDescription>
				</Alert>
			)}

			<div className="grid gap-5 lg:grid-cols-2">
				{sections.map((s) => (
					<Card key={s.title}>
						<CardHeader>
							<CardTitle>{s.title}</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-3 text-sm">
								{s.rows.map(([label, value]) => (
									<div
										key={label}
										className="grid gap-0.5 sm:grid-cols-[12rem_1fr]"
									>
										<dt className="text-muted-foreground">{label}</dt>
										<dd className="whitespace-pre-wrap break-words">{value}</dd>
									</div>
								))}
							</dl>
						</CardContent>
					</Card>
				))}
			</div>
		</div>
	);
}

function ApproveDialog({ application: a }: { application: ApplicationDetail }) {
	const navigate = useNavigate();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [feeError, setFeeError] = useState<string | null>(null);
	const today = todayInLagos();

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		const form = new FormData(e.currentTarget);
		const feeKobo = parseNaira(String(form.get("fee") ?? ""));
		if (feeKobo === null) {
			setFeeError(
				"Enter the fee in naira, e.g. 120,000 (0 for a free course).",
			);
			return;
		}
		setFeeError(null);
		setPending(true);
		const r = await approveApplication({
			data: {
				id: a.id,
				feeKobo,
				startsOn: String(form.get("startsOn") ?? ""),
				dueOn: String(form.get("dueOn") ?? ""),
			},
		});
		setPending(false);
		if (!r.ok) {
			toast.add({
				title: "Not approved",
				description: r.message,
				type: "error",
			});
			return;
		}
		setOpen(false);
		toast.add({
			title: `${a.full_name} is enrolled`,
			description:
				feeKobo > 0
					? "They're awaiting payment; record it on their registry page."
					: "The course is free, so they're active now.",
			type: "success",
		});
		await navigate({ to: "/students/$id", params: { id: r.data.studentId } });
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button>
						<CheckIcon data-icon="inline-start" />
						Approve
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>Approve {a.full_name}</DialogTitle>
						<DialogDescription>
							Enrols them in {a.course} and invoices the fee.
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<Field data-invalid={feeError ? true : undefined}>
							<FieldLabel htmlFor="approve-fee">Fee (₦)</FieldLabel>
							<Input
								id="approve-fee"
								name="fee"
								inputMode="decimal"
								required
								defaultValue={
									a.course_fee_kobo
										? formatNaira(a.course_fee_kobo).replace(/[^\d,]/g, "")
										: ""
								}
								aria-invalid={feeError ? true : undefined}
							/>
							<FieldDescription>
								{feeError ??
									(a.course_fee_kobo
										? `The course fee is ${formatNaira(a.course_fee_kobo)}; change it for a discount.`
										: "This course has no fee on record; enter it.")}
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="approve-start">Starts on</FieldLabel>
							<Input
								id="approve-start"
								name="startsOn"
								type="date"
								defaultValue={today}
								required
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="approve-due">Payment due</FieldLabel>
							<Input
								id="approve-due"
								name="dueOn"
								type="date"
								defaultValue={today}
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							Approve and enrol
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

function DeclineDialog({ application: a }: { application: ApplicationDetail }) {
	const router = useRouter();
	const [reason, setReason] = useState("");

	async function decline() {
		const r = await declineApplication({ data: { id: a.id, reason } });
		if (!r.ok) {
			toast.add({
				title: "Not declined",
				description: r.message,
				type: "error",
			});
			return;
		}
		toast.add({
			title: `${a.full_name}'s application was declined`,
			type: "success",
		});
		await router.invalidate();
	}

	return (
		<AlertDialog>
			<AlertDialogTrigger
				render={
					<Button variant="outline">
						<XIcon data-icon="inline-start" />
						Decline
					</Button>
				}
			/>
			<AlertDialogContent>
				<AlertDialogHeader>
					<AlertDialogTitle>
						Decline {a.full_name}'s application?
					</AlertDialogTitle>
					<AlertDialogDescription>
						It stays on record as declined. They aren't told automatically.
					</AlertDialogDescription>
				</AlertDialogHeader>
				<Field>
					<FieldLabel htmlFor="decline-reason">Reason (optional)</FieldLabel>
					<Textarea
						id="decline-reason"
						maxLength={500}
						value={reason}
						onChange={(e) => setReason(e.target.value)}
					/>
				</Field>
				<AlertDialogFooter>
					<AlertDialogCancel variant="ghost">Cancel</AlertDialogCancel>
					<AlertDialogAction variant="destructive" onClick={decline}>
						Decline
					</AlertDialogAction>
				</AlertDialogFooter>
			</AlertDialogContent>
		</AlertDialog>
	);
}
