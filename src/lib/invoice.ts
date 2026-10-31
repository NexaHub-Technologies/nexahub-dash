/* What the Fees screens work out about an invoice, kept free of server code
   so both sides (and the unit tests) share it. Dates are calendar dates in
   Lagos ("2026-11-09"); money is kobo. */

export const DUE_SOON_DAYS = 7;

/* the Fees tabs; "unpaid" is everything still owed, overdue or not */
export const INVOICE_VIEWS = [
	"overdue",
	"due_soon",
	"unpaid",
	"paid",
	"void",
	"all",
] as const;
export type InvoiceView = (typeof INVOICE_VIEWS)[number];
export const isInvoiceView = (v: unknown): v is InvoiceView =>
	typeof v === "string" && (INVOICE_VIEWS as readonly string[]).includes(v);

export type InvoiceState = "overdue" | "due_soon" | "open" | "paid" | "void";

/* whole days from one calendar date to another (negative when `to` is
   earlier) */
export function daysBetween(from: string, to: string) {
	return Math.round(
		(Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) /
			86_400_000,
	);
}

export function invoiceState(
	i: { status: string; due_on: string; balance_kobo: number },
	today: string,
): InvoiceState {
	if (i.status === "void") return "void";
	if (i.status === "paid" || i.balance_kobo <= 0) return "paid";
	const days = daysBetween(today, i.due_on);
	if (days < 0) return "overdue";
	if (days <= DUE_SOON_DAYS) return "due_soon";
	return "open";
}

/* "Due today", "Due in 3 days", "12 days overdue" */
export function dueLabel(due_on: string, today: string) {
	const days = daysBetween(today, due_on);
	if (days === 0) return "Due today";
	if (days === 1) return "Due tomorrow";
	if (days > 1) return `Due in ${days} days`;
	return days === -1 ? "1 day overdue" : `${-days} days overdue`;
}

/* A Nigerian phone number as WhatsApp wants it (2348031234567), from the
   ways people write it: 0803 123 4567, +234 803 123 4567, 234-803-...
   Null when it isn't one. */
export function whatsappNumber(phone: string | null | undefined) {
	const digits = (phone ?? "").replace(/\D/g, "");
	if (/^0[789][01]\d{8}$/.test(digits)) return `234${digits.slice(1)}`;
	if (/^234[789][01]\d{8}$/.test(digits)) return digits;
	if (/^[789][01]\d{8}$/.test(digits)) return `234${digits}`;
	return null;
}

export function whatsappLink(phone: string | null | undefined, text: string) {
	const n = whatsappNumber(phone);
	return n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : null;
}

/* a "YYYY-MM" month, as an <input type="month"> sends it */
export const isMonth = (v: unknown): v is string =>
	typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export function monthLabel(month: string) {
	return new Intl.DateTimeFormat("en-NG", {
		month: "long",
		year: "numeric",
		timeZone: "UTC",
	}).format(new Date(`${month}-01T00:00:00Z`));
}

/* Rows as CSV that Excel and Google Sheets open as they are: fields with a
   comma, quote or line break are quoted, quotes doubled, and a leading
   = + - @ is neutralised so a cell can't run as a formula. */
export function toCsv(rows: (string | number | null)[][]) {
	const cell = (v: string | number | null) => {
		let s = v === null ? "" : String(v);
		if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
		return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	return `${rows.map((r) => r.map(cell).join(",")).join("\r\n")}\r\n`;
}
