import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { type Db, withStaff } from "./db.server";
import {
	DUE_SOON_DAYS,
	type InvoiceView,
	isInvoiceView,
	isMonth,
} from "./invoice";
import { type Outcome, refusal } from "./outcome";

/* Fees across every student: what is owed and by when, and what has come
   in. Admins only, which the database enforces (invoices and payments are
   admin business under RLS); everyone else gets empty lists. The rules for
   changing an invoice are the database's (20261102090000_invoice_rules.sql),
   so a refusal here carries its own explanation. "Today" and "this month"
   are in Lagos. */

export type InvoiceRow = {
	id: string;
	description: string;
	amount_kobo: number;
	paid_kobo: number;
	balance_kobo: number;
	due_on: string;
	status: string;
	enrolment_id: string;
	student_id: string;
	full_name: string;
	email: string;
	phone: string | null;
	course: string;
};

export type FeesSummary = {
	unpaidKobo: number;
	overdueKobo: number;
	dueSoonKobo: number;
	collectedThisMonthKobo: number;
	paymentsThisMonth: number;
};

export type PaymentRow = {
	id: string;
	paid_at: string;
	amount_kobo: number;
	method: string;
	reference: string;
	recorded_by: string | null;
	invoice: string;
	student_id: string;
	full_name: string;
	course: string;
};

const today = sql<string>`(now() at time zone 'Africa/Lagos')::date`;
const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

const lagosToday = () =>
	new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lagos" }).format(
		new Date(),
	);

/* the predicate behind each tab, on invoices i joined to invoice_balances b */
function viewFilter(view: InvoiceView) {
	const owed = sql`i.status = 'open' and b.balance_kobo > 0`;
	switch (view) {
		case "overdue":
			return sql`${owed} and i.due_on < ${today}`;
		case "due_soon":
			return sql`${owed} and i.due_on between ${today} and ${today} + ${DUE_SOON_DAYS}::int`;
		case "unpaid":
			return owed;
		case "paid":
			return sql`i.status = 'paid'`;
		case "void":
			return sql`i.status = 'void'`;
		default:
			return sql`true`;
	}
}

export const listInvoices = createServerFn({ method: "GET" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			view: isInvoiceView(o.view) ? o.view : ("unpaid" as const),
			q: typeof o.q === "string" ? o.q.trim().slice(0, 100) : "",
			course: typeof o.course === "string" ? o.course : "",
		};
	})
	.handler(async ({ data }) => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const like = `%${data.q.replace(/[%_\\]/g, "\\$&")}%`;
			const { rows } = await sql<Record<string, unknown>>`
				select i.id, i.description, i.amount_kobo::text, b.paid_kobo::text,
					b.balance_kobo::text, i.due_on::text, i.status::text,
					e.id as enrolment_id, s.id as student_id, s.full_name, s.email, s.phone,
					coalesce(c.title, e.course_slug) as course
				from public.invoices i
				join public.invoice_balances b on b.invoice_id = i.id
				join public.enrolments e on e.id = i.enrolment_id
				join public.students s on s.id = e.student_id
				left join public.courses c on c.slug = e.course_slug
				where ${viewFilter(data.view)}
					and ${data.course ? sql`e.course_slug = ${data.course}` : sql`true`}
					and ${
						data.q
							? sql`(s.full_name ilike ${like} or s.email ilike ${like} or coalesce(s.phone, '') ilike ${like} or i.description ilike ${like})`
							: sql`true`
					}
				order by ${
					data.view === "paid" || data.view === "void" || data.view === "all"
						? sql`i.created_at desc`
						: sql`i.due_on, s.full_name`
				}
				limit 300`.execute(db);

			const { rows: tallies } = await sql<Record<string, string>>`
				select
					count(*) filter (where ${viewFilter("overdue")}) as overdue,
					count(*) filter (where ${viewFilter("due_soon")}) as due_soon,
					count(*) filter (where ${viewFilter("unpaid")}) as unpaid,
					count(*) filter (where ${viewFilter("paid")}) as paid,
					count(*) filter (where ${viewFilter("void")}) as void,
					count(*) as all,
					coalesce(sum(b.balance_kobo) filter (where ${viewFilter("unpaid")}), 0) as unpaid_kobo,
					coalesce(sum(b.balance_kobo) filter (where ${viewFilter("overdue")}), 0) as overdue_kobo,
					coalesce(sum(b.balance_kobo) filter (where ${viewFilter("due_soon")}), 0) as due_soon_kobo
				from public.invoices i
				join public.invoice_balances b on b.invoice_id = i.id`.execute(db);
			const { rows: month } = await sql<Record<string, string>>`
				select coalesce(sum(amount_kobo), 0) as collected, count(*) as payments
				from public.payments
				where date_trunc('month', paid_at at time zone 'Africa/Lagos')
					= date_trunc('month', now() at time zone 'Africa/Lagos')`.execute(db);

			const courses = await db
				.selectFrom("courses")
				.select(["slug", "title"])
				.orderBy("title")
				.execute();

			const t = tallies[0] ?? {};
			const n = (k: string) => Number(t[k] ?? 0);
			return {
				today: lagosToday(),
				rows: rows.map(
					(r): InvoiceRow => ({
						id: String(r.id),
						description: String(r.description),
						amount_kobo: Number(r.amount_kobo),
						paid_kobo: Number(r.paid_kobo),
						balance_kobo: Number(r.balance_kobo),
						due_on: String(r.due_on),
						status: String(r.status),
						enrolment_id: String(r.enrolment_id),
						student_id: String(r.student_id),
						full_name: String(r.full_name),
						email: String(r.email),
						phone: (r.phone as string | null) ?? null,
						course: String(r.course),
					}),
				),
				counts: {
					overdue: n("overdue"),
					due_soon: n("due_soon"),
					unpaid: n("unpaid"),
					paid: n("paid"),
					void: n("void"),
					all: n("all"),
				} satisfies Record<InvoiceView, number>,
				summary: {
					unpaidKobo: n("unpaid_kobo"),
					overdueKobo: n("overdue_kobo"),
					dueSoonKobo: n("due_soon_kobo"),
					collectedThisMonthKobo: Number(month[0]?.collected ?? 0),
					paymentsThisMonth: Number(month[0]?.payments ?? 0),
				} satisfies FeesSummary,
				courses,
			};
		});
	});

/* Every payment received in one month (Lagos time), newest first. Shared
   by the payments page and its CSV statement. */
export async function loadPayments(db: Db, month: string) {
	const { rows } = await sql<Record<string, unknown>>`
		select p.id, p.paid_at, p.amount_kobo::text, p.method::text, p.reference,
			st.full_name as recorded_by, i.description as invoice,
			s.id as student_id, s.full_name, coalesce(c.title, e.course_slug) as course
		from public.payments p
		join public.invoices i on i.id = p.invoice_id
		join public.enrolments e on e.id = i.enrolment_id
		join public.students s on s.id = e.student_id
		left join public.courses c on c.slug = e.course_slug
		left join public.staff st on st.id = p.recorded_by
		where to_char(p.paid_at at time zone 'Africa/Lagos', 'YYYY-MM') = ${month}
		order by p.paid_at desc`.execute(db);
	return rows.map(
		(r): PaymentRow => ({
			id: String(r.id),
			paid_at: new Date(r.paid_at as string).toISOString(),
			amount_kobo: Number(r.amount_kobo),
			method: String(r.method),
			reference: String(r.reference),
			recorded_by: (r.recorded_by as string | null) ?? null,
			invoice: String(r.invoice),
			student_id: String(r.student_id),
			full_name: String(r.full_name),
			course: String(r.course),
		}),
	);
}

export const thisMonth = () => lagosToday().slice(0, 7);

export const listPayments = createServerFn({ method: "GET" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return { month: isMonth(o.month) ? o.month : thisMonth() };
	})
	.handler(async ({ data }) => {
		const staff = await signedIn();
		const rows = await withStaff(staff.id, (db) =>
			loadPayments(db, data.month),
		);
		const byMethod: Record<string, number> = {};
		for (const p of rows) {
			byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount_kobo;
		}
		return {
			month: data.month,
			rows,
			totalKobo: rows.reduce((sum, p) => sum + p.amount_kobo, 0),
			byMethod,
		};
	});

/* ── changes ─────────────────────────────────────────────────────────── */

const description = (v: unknown) =>
	String(v ?? "")
		.trim()
		.slice(0, 200);
const kobo = (v: unknown) => {
	const n = Number(v);
	return Number.isInteger(n) && n > 0 ? n : null;
};
const date = (v: unknown) => {
	const s = String(v ?? "");
	return DATE.test(s) ? s : null;
};

/* another invoice on an enrolment: a second instalment, an extra */
export const createInvoice = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			enrolmentId: String(o.enrolmentId ?? ""),
			description: description(o.description),
			amountKobo: kobo(o.amountKobo),
			dueOn: date(o.dueOn),
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (!UUID.test(data.enrolmentId))
			return { ok: false, message: "Choose the course it is for." };
		if (!data.description)
			return { ok: false, message: "Say what the invoice is for." };
		if (!data.amountKobo) return { ok: false, message: "Enter the amount." };
		if (!data.dueOn) return { ok: false, message: "Choose a due date." };
		const values = {
			enrolment_id: data.enrolmentId,
			description: data.description,
			amount_kobo: data.amountKobo,
			due_on: data.dueOn,
		};
		try {
			const staff = await signedIn();
			await withStaff(staff.id, (db) =>
				db.insertInto("invoices").values(values).execute(),
			);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

export const updateInvoice = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			invoiceId: String(o.invoiceId ?? ""),
			description: description(o.description),
			amountKobo: kobo(o.amountKobo),
			dueOn: date(o.dueOn),
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (!data.description)
			return { ok: false, message: "Say what the invoice is for." };
		if (!data.amountKobo) return { ok: false, message: "Enter the amount." };
		if (!data.dueOn) return { ok: false, message: "Choose a due date." };
		const changes = {
			description: data.description,
			amount_kobo: data.amountKobo,
			due_on: data.dueOn,
		};
		try {
			const staff = await signedIn();
			const r = await withStaff(staff.id, (db) =>
				db
					.updateTable("invoices")
					.set(changes)
					.where("id", "=", data.invoiceId)
					.executeTakeFirst(),
			);
			if (!r.numUpdatedRows)
				return { ok: false, message: "Only an admin can change invoices." };
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

export const voidInvoice = createServerFn({ method: "POST" })
	.validator((id: unknown) => String(id ?? ""))
	.handler(async ({ data: id }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			const r = await withStaff(staff.id, (db) =>
				db
					.updateTable("invoices")
					.set({ status: "void" })
					.where("id", "=", id)
					.executeTakeFirst(),
			);
			if (!r.numUpdatedRows)
				return { ok: false, message: "Only an admin can void invoices." };
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});
