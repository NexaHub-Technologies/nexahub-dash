import { createFileRoute, Link, redirect } from "@tanstack/react-router";
import { ArrowLeftIcon, DownloadIcon, WalletIcon } from "lucide-react";
import { Section } from "#/components/dashboard/section";
import { Button } from "#/components/ui/button";
import {
	Empty,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "#/components/ui/empty";
import { Input } from "#/components/ui/input";
import {
	Table,
	TableBody,
	TableCell,
	TableFooter,
	TableHead,
	TableHeader,
	TableRow,
} from "#/components/ui/table";
import { listPayments } from "#/lib/fees";
import { formatCount, formatDate, formatNaira } from "#/lib/format";
import { isMonth, monthLabel } from "#/lib/invoice";

type Search = { month?: string };

export const Route = createFileRoute("/_app/fees/payments")({
	beforeLoad: ({ context }) => {
		if (context.staff.role !== "admin") throw redirect({ to: "/" });
	},
	validateSearch: (s: Record<string, unknown>): Search =>
		isMonth(s.month) ? { month: s.month } : {},
	loaderDeps: ({ search }) => search,
	loader: ({ deps }) => listPayments({ data: { month: deps.month } }),
	component: Payments,
});

export const METHOD_LABEL: Record<string, string> = {
	transfer: "Transfer",
	cash: "Cash",
	paystack: "Paystack",
};

/* The month's takings, payment by payment: the statement the books are
   kept from, and downloadable as CSV for a spreadsheet. */
function Payments() {
	const { month, rows, totalKobo, byMethod } = Route.useLoaderData();
	const split = Object.entries(byMethod)
		.map(([m, kobo]) => `${METHOD_LABEL[m] ?? m} ${formatNaira(kobo)}`)
		.join(" · ");

	return (
		<Section
			title={`Payments, ${monthLabel(month)}`}
			description={
				rows.length
					? `${formatCount(rows.length)} payments, ${formatNaira(totalKobo)} in all${split ? ` (${split})` : ""}.`
					: "Every transfer, cash and Paystack payment received in the month."
			}
			toolbar={
				<>
					<Button
						variant="ghost"
						nativeButton={false}
						render={<Link to="/fees" />}
					>
						<ArrowLeftIcon data-icon="inline-start" />
						Fees
					</Button>
					<form method="get" action="/fees/payments" className="flex gap-2">
						<Input
							type="month"
							name="month"
							defaultValue={month}
							aria-label="Month"
							className="w-44"
						/>
						<Button type="submit" variant="outline">
							Show
						</Button>
					</form>
					<Button
						nativeButton={false}
						render={
							// a file download, not a page: the browser fetches it directly
							// biome-ignore lint/a11y/useAnchorContent: Base UI renders the button's icon and label inside this link
							<a
								href={`/fees/payments.csv?month=${month}`}
								download
								aria-label={`Download ${monthLabel(month)} as CSV`}
							/>
						}
					>
						<DownloadIcon data-icon="inline-start" />
						Download CSV
					</Button>
				</>
			}
		>
			{rows.length ? (
				<Table>
					<TableHeader>
						<TableRow>
							<TableHead>Paid on</TableHead>
							<TableHead>Student</TableHead>
							<TableHead className="hidden md:table-cell">Invoice</TableHead>
							<TableHead className="hidden sm:table-cell">Method</TableHead>
							<TableHead className="hidden lg:table-cell">Reference</TableHead>
							<TableHead className="text-right">Amount</TableHead>
						</TableRow>
					</TableHeader>
					<TableBody>
						{rows.map((p) => (
							<TableRow key={p.id}>
								<TableCell className="whitespace-nowrap text-muted-foreground">
									{formatDate(p.paid_at)}
								</TableCell>
								<TableCell>
									<Link
										to="/students/$id"
										params={{ id: p.student_id }}
										className="flex flex-col"
									>
										<span className="font-medium hover:underline">
											{p.full_name}
										</span>
										<span className="text-xs text-muted-foreground">
											{p.course}
										</span>
									</Link>
								</TableCell>
								<TableCell className="hidden md:table-cell">
									{p.invoice}
								</TableCell>
								<TableCell className="hidden sm:table-cell">
									{METHOD_LABEL[p.method] ?? p.method}
									{p.recorded_by ? (
										<span className="block text-xs text-muted-foreground">
											by {p.recorded_by}
										</span>
									) : null}
								</TableCell>
								<TableCell className="hidden font-mono text-xs lg:table-cell">
									{p.reference}
								</TableCell>
								<TableCell className="text-right font-medium tabular-nums">
									{formatNaira(p.amount_kobo)}
								</TableCell>
							</TableRow>
						))}
					</TableBody>
					<TableFooter>
						<TableRow>
							<TableCell colSpan={5} className="hidden lg:table-cell">
								Total
							</TableCell>
							<TableCell className="lg:hidden">Total</TableCell>
							<TableCell className="text-right font-semibold tabular-nums">
								{formatNaira(totalKobo)}
							</TableCell>
						</TableRow>
					</TableFooter>
				</Table>
			) : (
				<Empty>
					<EmptyHeader>
						<EmptyMedia variant="icon">
							<WalletIcon />
						</EmptyMedia>
						<EmptyTitle>No payments in {monthLabel(month)}</EmptyTitle>
						<EmptyDescription>
							Payments recorded on the Fees page or a student's page appear
							here, in the month they were paid.
						</EmptyDescription>
					</EmptyHeader>
				</Empty>
			)}
		</Section>
	);
}
