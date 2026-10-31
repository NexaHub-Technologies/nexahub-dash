import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import {
	AlarmClockIcon,
	BanknoteIcon,
	CalendarClockIcon,
	ReceiptIcon,
	WalletIcon,
} from "lucide-react";
import { StatCard } from "#/components/dashboard/blocks";
import { InvoiceActions } from "#/components/dashboard/fee-dialogs";
import { Filters } from "#/components/dashboard/filters";
import { LinkTabs } from "#/components/dashboard/link-tabs";
import { Section } from "#/components/dashboard/section";
import { TonePill } from "#/components/dashboard/status-badge";
import { Button } from "#/components/ui/button";
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
import { listInvoices } from "#/lib/fees";
import { formatCount, formatDate, formatNaira } from "#/lib/format";
import {
	DUE_SOON_DAYS,
	dueLabel,
	type InvoiceState,
	type InvoiceView,
	invoiceState,
	isInvoiceView,
} from "#/lib/invoice";

type Search = { status?: InvoiceView; q?: string; course?: string };

export const Route = createFileRoute("/_app/fees/")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search => ({
		...(isInvoiceView(s.status) ? { status: s.status } : {}),
		...(typeof s.q === "string" && s.q ? { q: s.q } : {}),
		...(typeof s.course === "string" && s.course ? { course: s.course } : {}),
	}),
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) =>
		listInvoices({
			data: { view: deps.status ?? "unpaid", q: deps.q, course: deps.course },
		}),
	component: Fees,
});

const TABS: { key: InvoiceView; label: string }[] = [
	{ key: "unpaid", label: "Unpaid" },
	{ key: "overdue", label: "Overdue" },
	{ key: "due_soon", label: "Due soon" },
	{ key: "paid", label: "Paid" },
	{ key: "void", label: "Voided" },
	{ key: "all", label: "All" },
];

const STATE_TONE: Record<
	InvoiceState,
	"danger" | "warning" | "neutral" | "success"
> = {
	overdue: "danger",
	due_soon: "warning",
	open: "neutral",
	paid: "success",
	void: "neutral",
};

function StateBadge({
	state,
	dueOn,
	today,
}: {
	state: InvoiceState;
	dueOn: string;
	today: string;
}) {
	const label =
		state === "paid"
			? "Paid"
			: state === "void"
				? "Voided"
				: dueLabel(dueOn, today);
	return <TonePill tone={STATE_TONE[state]}>{label}</TonePill>;
}

const invoices = (n: number, kind = "") =>
	`${formatCount(n)} ${kind ? `${kind} ` : ""}${n === 1 ? "invoice" : "invoices"}`;

/* Every invoice across the school: who owes what and by when, overdue
   first, with the payment, change, reminder and void actions on each. */
function Fees() {
	const { rows, counts, summary, courses, today } = Route.useLoaderData();
	const search = Route.useSearch();
	const tab = search.status ?? "unpaid";

	return (
		<div className="flex flex-col gap-5">
			<div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
				<StatCard
					label="Owed in total"
					value={formatNaira(summary.unpaidKobo)}
					Icon={ReceiptIcon}
					tone="brand"
					footer={invoices(counts.unpaid, "unpaid")}
				/>
				<StatCard
					label="Overdue"
					value={formatNaira(summary.overdueKobo)}
					Icon={AlarmClockIcon}
					tone={counts.overdue ? "danger" : "success"}
					footer={
						counts.overdue
							? `${formatCount(counts.overdue)} past their due date`
							: "All clear"
					}
				/>
				<StatCard
					label={`Due in the next ${DUE_SOON_DAYS} days`}
					value={formatNaira(summary.dueSoonKobo)}
					Icon={CalendarClockIcon}
					tone="warning"
					footer={invoices(counts.due_soon)}
				/>
				<StatCard
					label="Collected this month"
					value={formatNaira(summary.collectedThisMonthKobo)}
					Icon={BanknoteIcon}
					tone="success"
					to="/fees/payments"
					footer={`${formatCount(summary.paymentsThisMonth)} ${summary.paymentsThisMonth === 1 ? "payment" : "payments"}`}
				/>
			</div>

			<Section
				title="Fees"
				description="Invoices across every student. Record transfers and cash as they come in; the student becomes active on their first payment."
				toolbar={
					<>
						<Filters
							action="/fees"
							status={search.status}
							q={search.q}
							course={search.course}
							courses={courses}
							placeholder="Search student or invoice"
						/>
						<Button
							variant="outline"
							nativeButton={false}
							render={<Link to="/fees/payments" />}
						>
							<WalletIcon data-icon="inline-start" />
							Payments
						</Button>
					</>
				}
			>
				<LinkTabs
					label="Invoices"
					tabs={TABS.map((t) => ({
						key: t.key,
						label: t.label,
						to: "/fees",
						search: {
							...search,
							status: t.key === "unpaid" ? undefined : t.key,
						},
						count: counts[t.key],
						active: tab === t.key,
					}))}
				/>
				{rows.length ? (
					<Table>
						<TableHeader>
							<TableRow>
								<TableHead>Student</TableHead>
								<TableHead className="hidden sm:table-cell">Invoice</TableHead>
								<TableHead className="hidden lg:table-cell">Due</TableHead>
								<TableHead className="hidden text-right md:table-cell">
									Amount
								</TableHead>
								<TableHead className="text-right">Balance</TableHead>
								<TableHead className="text-right">
									<span className="sr-only">Actions</span>
								</TableHead>
							</TableRow>
						</TableHeader>
						<TableBody>
							{rows.map((i) => {
								const state = invoiceState(i, today);
								return (
									<TableRow key={i.id}>
										<TableCell className="whitespace-normal">
											<Link
												to="/students/$id"
												params={{ id: i.student_id }}
												className="flex flex-col"
											>
												<span className="font-medium hover:underline">
													{i.full_name}
												</span>
												<span className="text-xs text-muted-foreground">
													{i.course}
												</span>
											</Link>
											{/* on a phone the invoice folds in under the student */}
											<span className="mt-1.5 flex flex-col items-start gap-1 sm:hidden">
												<span className="text-sm">{i.description}</span>
												<StateBadge
													state={state}
													dueOn={i.due_on}
													today={today}
												/>
											</span>
										</TableCell>
										<TableCell className="hidden sm:table-cell">
											<span className="flex flex-col items-start gap-1">
												<span>{i.description}</span>
												<StateBadge
													state={state}
													dueOn={i.due_on}
													today={today}
												/>
											</span>
										</TableCell>
										<TableCell className="hidden whitespace-nowrap text-muted-foreground lg:table-cell">
											{formatDate(i.due_on)}
										</TableCell>
										<TableCell className="hidden text-right tabular-nums md:table-cell">
											{formatNaira(i.amount_kobo)}
										</TableCell>
										<TableCell className="text-right font-medium tabular-nums">
											{i.status === "void"
												? "—"
												: formatNaira(Math.max(i.balance_kobo, 0))}
										</TableCell>
										<TableCell className="text-right">
											<InvoiceActions
												invoice={i}
												studentName={i.full_name}
												phone={i.phone}
												course={i.course}
											/>
										</TableCell>
									</TableRow>
								);
							})}
						</TableBody>
					</Table>
				) : (
					<Empty>
						<EmptyHeader>
							<EmptyMedia variant="icon">
								<ReceiptIcon />
							</EmptyMedia>
							<EmptyTitle>
								{search.q || search.course
									? "No matching invoices"
									: tab === "overdue"
										? "Nothing overdue"
										: "Nothing here"}
							</EmptyTitle>
							<EmptyDescription>
								{tab === "unpaid" || tab === "overdue" || tab === "due_soon"
									? "Invoices are raised when an application is approved, or added from a student's page."
									: "Try another tab or clear the filters."}
							</EmptyDescription>
						</EmptyHeader>
					</Empty>
				)}
			</Section>
		</div>
	);
}
