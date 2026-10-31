import {
	BanIcon,
	MessageCircleIcon,
	MoreHorizontalIcon,
	PencilIcon,
	PlusIcon,
	WalletIcon,
} from "lucide-react";
import { useState } from "react";
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
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
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
import { createInvoice, updateInvoice, voidInvoice } from "#/lib/fees";
import { formatDate, formatNaira, parseNaira } from "#/lib/format";
import { whatsappLink } from "#/lib/invoice";
import { recordPayment } from "#/lib/students";
import { useApply } from "./use-apply";

/* The fee actions, shared by the Fees section and a student's page:
   recording a payment, adding or changing an invoice, voiding one, and a
   WhatsApp reminder. The database decides what is allowed (an invoice with
   payments can't be voided, an amount can't drop below what was paid) and
   its reason is shown when it refuses. */

export type FeeInvoice = {
	id: string;
	description: string;
	amount_kobo: number;
	paid_kobo: number;
	balance_kobo: number;
	due_on: string;
	status: string;
};

const todayInLagos = () =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
		new Date(),
	);

/* kobo as the plain figure a naira box is prefilled with ("75,000") */
const nairaField = (kobo: number) =>
	kobo > 0 ? formatNaira(kobo).replace(/[^\d,.]/g, "") : "";

function AmountField({
	id,
	defaultKobo,
	error,
	label = "Amount (₦)",
}: {
	id: string;
	defaultKobo: number;
	error: string | null;
	label?: string;
}) {
	return (
		<Field data-invalid={error ? true : undefined}>
			<FieldLabel htmlFor={id}>{label}</FieldLabel>
			<Input
				id={id}
				name="amount"
				inputMode="decimal"
				required
				defaultValue={nairaField(defaultKobo)}
				aria-invalid={error ? true : undefined}
			/>
			{error ? <FieldDescription>{error}</FieldDescription> : null}
		</Field>
	);
}

export function PaymentDialog({
	invoice,
	studentName,
}: {
	invoice: FeeInvoice;
	studentName: string;
}) {
	const apply = useApply();
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [method, setMethod] = useState<"transfer" | "cash">("transfer");
	const [amountError, setAmountError] = useState<string | null>(null);
	const balance = Math.max(invoice.balance_kobo, 0);

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const form = new FormData(ev.currentTarget);
		const amountKobo = parseNaira(String(form.get("amount") ?? ""));
		if (!amountKobo) {
			setAmountError("Enter the amount paid in naira, e.g. 50,000.");
			return;
		}
		setAmountError(null);
		setPending(true);
		const ok = await apply(
			recordPayment({
				data: {
					invoiceId: invoice.id,
					amountKobo,
					method,
					reference: String(form.get("reference") ?? ""),
					paidOn: String(form.get("paidOn") ?? ""),
				},
			}),
			`${formatNaira(amountKobo)} recorded for ${studentName}`,
		);
		setPending(false);
		if (ok) setOpen(false);
	}

	return (
		<Dialog open={open} onOpenChange={setOpen}>
			<DialogTrigger
				render={
					<Button variant="outline" size="sm">
						<WalletIcon data-icon="inline-start" />
						{/* an icon alone on a phone; the label is still announced */}
						<span className="sr-only sm:not-sr-only">Record payment</span>
					</Button>
				}
			/>
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>Record a payment</DialogTitle>
						<DialogDescription>
							{studentName} · {invoice.description} · {formatNaira(balance)}{" "}
							outstanding
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						<AmountField
							id="pay-amount"
							defaultKobo={balance}
							error={amountError}
						/>
						<Field>
							<FieldLabel htmlFor="pay-method">Method</FieldLabel>
							<Select
								items={[
									{ label: "Bank transfer", value: "transfer" },
									{ label: "Cash", value: "cash" },
								]}
								value={method}
								onValueChange={(v) =>
									setMethod(v === "cash" ? "cash" : "transfer")
								}
							>
								<SelectTrigger id="pay-method">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectGroup>
										<SelectItem value="transfer">Bank transfer</SelectItem>
										<SelectItem value="cash">Cash</SelectItem>
									</SelectGroup>
								</SelectContent>
							</Select>
						</Field>
						<Field>
							<FieldLabel htmlFor="pay-reference">Reference</FieldLabel>
							<Input
								id="pay-reference"
								name="reference"
								required
								maxLength={120}
							/>
							<FieldDescription>
								The transfer reference or receipt number. Each one can be
								recorded once.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="pay-date">Paid on</FieldLabel>
							<Input
								id="pay-date"
								name="paidOn"
								type="date"
								defaultValue={todayInLagos()}
								required
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							Record payment
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

/* Adds an invoice to one of a student's courses, or changes one. */
export function InvoiceDialog({
	invoice,
	enrolments,
	open,
	onOpenChange,
	trigger,
}: {
	invoice?: FeeInvoice;
	enrolments?: { id: string; course: string }[];
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	trigger?: React.ReactElement;
}) {
	const apply = useApply();
	const [ownOpen, setOwnOpen] = useState(false);
	const isOpen = open ?? ownOpen;
	const setOpen = onOpenChange ?? setOwnOpen;
	const [pending, setPending] = useState(false);
	const [amountError, setAmountError] = useState<string | null>(null);
	const [enrolmentId, setEnrolmentId] = useState(enrolments?.[0]?.id ?? "");
	const editing = Boolean(invoice);

	async function onSubmit(ev: React.FormEvent<HTMLFormElement>) {
		ev.preventDefault();
		const form = new FormData(ev.currentTarget);
		const amountKobo = parseNaira(String(form.get("amount") ?? ""));
		if (!amountKobo) {
			setAmountError("Enter the amount in naira, e.g. 50,000.");
			return;
		}
		setAmountError(null);
		setPending(true);
		const fields = {
			description: String(form.get("description") ?? ""),
			amountKobo,
			dueOn: String(form.get("dueOn") ?? ""),
		};
		const ok = await apply(
			invoice
				? updateInvoice({ data: { invoiceId: invoice.id, ...fields } })
				: createInvoice({ data: { enrolmentId, ...fields } }),
			invoice
				? "Invoice updated"
				: `Invoice for ${formatNaira(amountKobo)} added`,
		);
		setPending(false);
		if (ok) setOpen(false);
	}

	return (
		<Dialog open={isOpen} onOpenChange={setOpen}>
			{trigger ? <DialogTrigger render={trigger} /> : null}
			<DialogContent>
				<form onSubmit={onSubmit} className="flex flex-col gap-6">
					<DialogHeader>
						<DialogTitle>
							{editing ? "Change invoice" : "Add an invoice"}
						</DialogTitle>
						<DialogDescription>
							{invoice && invoice.paid_kobo > 0
								? `${formatNaira(invoice.paid_kobo)} has been paid, so the amount can't go below that.`
								: editing
									? "Change what it is for, the amount or when it is due."
									: "A second instalment, an extra, or a fee that wasn't invoiced on approval."}
						</DialogDescription>
					</DialogHeader>
					<FieldGroup>
						{!editing && enrolments && enrolments.length > 1 ? (
							<Field>
								<FieldLabel htmlFor="invoice-course">Course</FieldLabel>
								<Select
									items={enrolments.map((e) => ({
										label: e.course,
										value: e.id,
									}))}
									value={enrolmentId}
									onValueChange={(v) => setEnrolmentId(String(v))}
								>
									<SelectTrigger id="invoice-course">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{enrolments.map((e) => (
												<SelectItem key={e.id} value={e.id}>
													{e.course}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						) : null}
						<Field>
							<FieldLabel htmlFor="invoice-description">For</FieldLabel>
							<Input
								id="invoice-description"
								name="description"
								required
								maxLength={200}
								defaultValue={invoice?.description}
								placeholder="Second instalment"
							/>
						</Field>
						<AmountField
							id="invoice-amount"
							defaultKobo={invoice?.amount_kobo ?? 0}
							error={amountError}
						/>
						<Field>
							<FieldLabel htmlFor="invoice-due">Due on</FieldLabel>
							<Input
								id="invoice-due"
								name="dueOn"
								type="date"
								required
								defaultValue={invoice?.due_on ?? todayInLagos()}
							/>
						</Field>
					</FieldGroup>
					<DialogFooter>
						<DialogClose render={<Button variant="ghost">Cancel</Button>} />
						<Button type="submit" disabled={pending}>
							{pending && <Spinner data-icon="inline-start" />}
							{editing ? "Save" : "Add invoice"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}

export function AddInvoiceButton({
	enrolments,
}: {
	enrolments: { id: string; course: string }[];
}) {
	if (!enrolments.length) return null;
	return (
		<InvoiceDialog
			enrolments={enrolments}
			trigger={
				<Button variant="outline" size="sm">
					<PlusIcon data-icon="inline-start" />
					Add invoice
				</Button>
			}
		/>
	);
}

/* what the reminder says; the admin can still edit it in WhatsApp */
export function reminderText(
	studentName: string,
	invoice: FeeInvoice,
	course: string,
) {
	const first = studentName.split(/\s+/)[0];
	return `Hello ${first}, this is NexaHubTech. A reminder that ${formatNaira(
		Math.max(invoice.balance_kobo, 0),
	)} is outstanding for ${invoice.description} (${course}), due ${formatDate(
		invoice.due_on,
	)}. If you've already paid, please send us the transfer reference. Thank you.`;
}

/* Record payment, plus a menu of the rest: change, remind, void. */
export function InvoiceActions({
	invoice,
	studentName,
	phone,
	course,
}: {
	invoice: FeeInvoice;
	studentName: string;
	phone: string | null;
	course: string;
}) {
	const apply = useApply();
	const [editing, setEditing] = useState(false);
	const [voiding, setVoiding] = useState(false);
	const [pending, setPending] = useState(false);
	const owed = invoice.status === "open" && invoice.balance_kobo > 0;
	const reminder = owed
		? whatsappLink(phone, reminderText(studentName, invoice, course))
		: null;
	if (invoice.status === "void") return null;

	return (
		<div className="flex items-center justify-end gap-1">
			{owed ? (
				<PaymentDialog invoice={invoice} studentName={studentName} />
			) : null}
			<DropdownMenu>
				<DropdownMenuTrigger
					render={
						<Button
							variant="ghost"
							size="icon-sm"
							aria-label={`More for ${invoice.description}, ${studentName}`}
						>
							<MoreHorizontalIcon />
						</Button>
					}
				/>
				<DropdownMenuContent align="end">
					<DropdownMenuGroup>
						<DropdownMenuItem onClick={() => setEditing(true)}>
							<PencilIcon />
							Change invoice
						</DropdownMenuItem>
						{reminder ? (
							<DropdownMenuItem
								onClick={() =>
									window.open(reminder, "_blank", "noopener,noreferrer")
								}
							>
								<MessageCircleIcon />
								Remind on WhatsApp
							</DropdownMenuItem>
						) : null}
					</DropdownMenuGroup>
					{invoice.paid_kobo === 0 ? (
						<>
							<DropdownMenuSeparator />
							<DropdownMenuGroup>
								<DropdownMenuItem
									variant="destructive"
									onClick={() => setVoiding(true)}
								>
									<BanIcon />
									Void invoice
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</>
					) : null}
				</DropdownMenuContent>
			</DropdownMenu>

			<InvoiceDialog
				invoice={invoice}
				open={editing}
				onOpenChange={setEditing}
			/>
			<AlertDialog open={voiding} onOpenChange={setVoiding}>
				<AlertDialogContent>
					<AlertDialogHeader>
						<AlertDialogTitle>Void this invoice?</AlertDialogTitle>
						<AlertDialogDescription>
							{invoice.description} for {formatNaira(invoice.amount_kobo)} (
							{studentName}) will no longer be owed and can't take payments.
							This can't be undone; add a new invoice if it is needed again.
						</AlertDialogDescription>
					</AlertDialogHeader>
					<AlertDialogFooter>
						<AlertDialogCancel>Keep it</AlertDialogCancel>
						<AlertDialogAction
							variant="destructive"
							disabled={pending}
							onClick={async () => {
								setPending(true);
								const ok = await apply(
									voidInvoice({ data: invoice.id }),
									"Invoice voided",
								);
								setPending(false);
								if (ok) setVoiding(false);
							}}
						>
							{pending && <Spinner data-icon="inline-start" />}
							Void invoice
						</AlertDialogAction>
					</AlertDialogFooter>
				</AlertDialogContent>
			</AlertDialog>
		</div>
	);
}
