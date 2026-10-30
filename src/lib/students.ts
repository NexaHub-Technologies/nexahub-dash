import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { type Db, withStaff } from "./db.server";
import { type Outcome, refusal } from "./outcome";
import { type EnrolmentStatus, isStatus } from "./status";

/* The student registry: who studies here, on which course, in what status,
   and what they owe. A student's status is per course (an enrolment); the
   registry lists one row per enrolment. Admins only: RLS limits everyone
   else to the students they teach, and the screens are admin-only too. */

export type RegistryRow = {
	student_id: string;
	enrolment_id: string;
	full_name: string;
	email: string;
	phone: string | null;
	course: string;
	course_slug: string;
	status: EnrolmentStatus;
	starts_on: string | null;
	balance_kobo: number;
};

export type StudentDetail = {
	id: string;
	full_name: string;
	email: string;
	phone: string | null;
	gender: string | null;
	employment: string | null;
	address: string | null;
	date_of_birth: string | null;
	created_at: string;
	application_id: string | null;
	enrolments: {
		id: string;
		course: string;
		course_slug: string;
		status: EnrolmentStatus;
		starts_on: string | null;
		created_at: string;
	}[];
	invoices: {
		id: string;
		enrolment_id: string;
		description: string;
		amount_kobo: number;
		paid_kobo: number;
		balance_kobo: number;
		due_on: string;
		status: string;
	}[];
	payments: {
		id: string;
		invoice_id: string;
		amount_kobo: number;
		method: string;
		reference: string;
		paid_at: string;
		recorded_by: string | null;
	}[];
	history: {
		enrolment_id: string;
		course_slug: string;
		at: string;
		from_status: string | null;
		to_status: string;
		actor_name: string | null;
	}[];
	application: Record<string, string | boolean> | null;
};

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

const UUID = /^[0-9a-f-]{36}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const dateText = (d: unknown) =>
	d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d) : null;

export const listStudents = createServerFn({ method: "GET" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			status: isStatus(o.status) ? o.status : undefined,
			q: typeof o.q === "string" ? o.q.trim().slice(0, 100) : "",
			course: typeof o.course === "string" ? o.course : "",
		};
	})
	.handler(async ({ data }) => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const like = `%${data.q.replace(/[%_\\]/g, "\\$&")}%`;
			const { rows } = await sql<Record<string, unknown>>`
				select s.id as student_id, e.id as enrolment_id, s.full_name, s.email, s.phone,
					coalesce(c.title, e.course_slug) as course, e.course_slug, e.status::text,
					e.starts_on::text,
					coalesce((select sum(b.balance_kobo) from public.invoice_balances b
						where b.enrolment_id = e.id and b.status = 'open'), 0)::text as balance_kobo
				from public.enrolments e
				join public.students s on s.id = e.student_id
				left join public.courses c on c.slug = e.course_slug
				where ${data.status ? sql`e.status = ${data.status}` : sql`true`}
					and ${data.course ? sql`e.course_slug = ${data.course}` : sql`true`}
					and ${
						data.q
							? sql`(s.full_name ilike ${like} or s.email ilike ${like} or coalesce(s.phone, '') ilike ${like})`
							: sql`true`
					}
				order by e.created_at desc
				limit 300`.execute(db);

			const counts = await db
				.selectFrom("enrolments")
				.select(["status", (eb) => eb.fn.countAll<string>().as("n")])
				.groupBy("status")
				.execute();
			const courses = await db
				.selectFrom("courses")
				.select(["slug", "title"])
				.orderBy("title")
				.execute();

			return {
				rows: rows.map(
					(r): RegistryRow => ({
						student_id: String(r.student_id),
						enrolment_id: String(r.enrolment_id),
						full_name: String(r.full_name),
						email: String(r.email),
						phone: (r.phone as string | null) ?? null,
						course: String(r.course),
						course_slug: String(r.course_slug),
						status: r.status as EnrolmentStatus,
						starts_on: (r.starts_on as string | null) ?? null,
						balance_kobo: Number(r.balance_kobo),
					}),
				),
				counts: Object.fromEntries(
					counts.map((c) => [String(c.status), Number(c.n)]),
				) as Partial<Record<EnrolmentStatus, number>>,
				courses,
			};
		});
	});

/* Everything the registry holds about one student. Used by the student's
   page and by the PDF record. */
export async function loadStudent(
	db: Db,
	id: string,
): Promise<StudentDetail | null> {
	if (!UUID.test(id)) return null;
	const s = await db
		.selectFrom("students")
		.selectAll()
		.where("id", "=", id)
		.executeTakeFirst();
	if (!s) return null;

	const enrolments = await db
		.selectFrom("enrolments as e")
		.leftJoin("courses as c", "c.slug", "e.course_slug")
		.select([
			"e.id",
			"e.course_slug",
			"e.status",
			"e.starts_on",
			"e.created_at",
			sql<string>`coalesce(c.title, e.course_slug)`.as("course"),
		])
		.where("e.student_id", "=", id)
		.orderBy("e.created_at", "desc")
		.execute();
	const enrolmentIds = enrolments.map((e) => e.id);

	const invoices = enrolmentIds.length
		? await db
				.selectFrom("invoices as i")
				.innerJoin("invoice_balances as b", "b.invoice_id", "i.id")
				.select([
					"i.id",
					"i.enrolment_id",
					"i.description",
					"i.amount_kobo",
					"i.due_on",
					"i.status",
					"b.paid_kobo",
					"b.balance_kobo",
				])
				.where("i.enrolment_id", "in", enrolmentIds)
				.orderBy("i.created_at")
				.execute()
		: [];
	const invoiceIds = invoices.map((i) => i.id);
	const payments = invoiceIds.length
		? await db
				.selectFrom("payments as p")
				.leftJoin("staff as st", "st.id", "p.recorded_by")
				.select([
					"p.id",
					"p.invoice_id",
					"p.amount_kobo",
					"p.method",
					"p.reference",
					"p.paid_at",
					"st.full_name as recorded_by",
				])
				.where("p.invoice_id", "in", invoiceIds)
				.orderBy("p.paid_at")
				.execute()
		: [];

	const { rows: history } = await sql<Record<string, unknown>>`
		select * from public.enrolment_history(${id}::uuid)`.execute(db);

	const app = s.application_id
		? await db
				.selectFrom("applications")
				.select([
					"mode",
					"has_experience",
					"experience_detail",
					"has_laptop",
					"heard_from",
					"can_commit",
					"comments",
					"notify_consent",
					"created_at",
				])
				.where("id", "=", s.application_id)
				.executeTakeFirst()
		: undefined;

	return {
		id: s.id,
		full_name: s.full_name,
		email: s.email,
		phone: s.phone,
		gender: s.gender,
		employment: s.employment,
		address: s.address,
		date_of_birth: dateText(s.date_of_birth),
		created_at: new Date(s.created_at).toISOString(),
		application_id: s.application_id,
		enrolments: enrolments.map((e) => ({
			id: e.id,
			course: e.course,
			course_slug: e.course_slug,
			status: e.status as EnrolmentStatus,
			starts_on: dateText(e.starts_on),
			created_at: new Date(e.created_at).toISOString(),
		})),
		invoices: invoices.map((i) => ({
			id: i.id,
			enrolment_id: i.enrolment_id,
			description: i.description,
			amount_kobo: Number(i.amount_kobo),
			paid_kobo: Number(i.paid_kobo ?? 0),
			balance_kobo: Number(i.balance_kobo ?? 0),
			due_on: String(dateText(i.due_on)),
			status: String(i.status),
		})),
		payments: payments.map((p) => ({
			id: p.id,
			invoice_id: p.invoice_id,
			amount_kobo: Number(p.amount_kobo),
			method: String(p.method),
			reference: p.reference,
			paid_at: new Date(p.paid_at).toISOString(),
			recorded_by: p.recorded_by,
		})),
		history: history.map((h) => ({
			enrolment_id: String(h.enrolment_id),
			course_slug: String(h.course_slug),
			at: new Date(h.at as string).toISOString(),
			from_status: (h.from_status as string | null) ?? null,
			to_status: String(h.to_status),
			actor_name: (h.actor_name as string | null) ?? null,
		})),
		application: app
			? {
					applied: new Date(app.created_at).toISOString(),
					mode: app.mode,
					has_experience: app.has_experience,
					experience_detail: app.experience_detail,
					has_laptop: app.has_laptop,
					heard_from: app.heard_from,
					can_commit: app.can_commit,
					comments: app.comments,
					notify_consent: app.notify_consent,
				}
			: null,
	};
}

export const getStudent = createServerFn({ method: "GET" })
	.validator((id: unknown) => String(id ?? ""))
	.handler(async ({ data: id }) => {
		const staff = await signedIn();
		return withStaff(staff.id, (db) => loadStudent(db, id));
	});

const text = (v: unknown, max: number) => {
	const s = String(v ?? "").trim();
	return s ? s.slice(0, max) : null;
};

export const updateStudent = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const dob = String(o.date_of_birth ?? "");
		return {
			id: String(o.id ?? ""),
			full_name: String(o.full_name ?? "").trim(),
			email: String(o.email ?? "")
				.trim()
				.toLowerCase(),
			phone: text(o.phone, 40),
			gender: text(o.gender, 40),
			employment: text(o.employment, 40),
			address: text(o.address, 300),
			date_of_birth: DATE.test(dob) ? dob : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		const { id, ...changes } = data;
		if (!changes.full_name) return { ok: false, message: "A name is needed." };
		try {
			const staff = await signedIn();
			const r = await withStaff(staff.id, (db) =>
				db
					.updateTable("students")
					.set(changes)
					.where("id", "=", id)
					.executeTakeFirst(),
			);
			if (!r.numUpdatedRows) {
				return {
					ok: false,
					message: "Only an admin can change student details.",
				};
			}
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

export const setEnrolmentStatus = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			enrolmentId: String(o.enrolmentId ?? ""),
			status: isStatus(o.status) ? o.status : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (!data.status) return { ok: false, message: "Choose a status." };
		const status = data.status;
		try {
			const staff = await signedIn();
			const r = await withStaff(staff.id, (db) =>
				db
					.updateTable("enrolments")
					.set({ status })
					.where("id", "=", data.enrolmentId)
					.executeTakeFirst(),
			);
			if (!r.numUpdatedRows) {
				return {
					ok: false,
					message: "Only an admin can change a student's status.",
				};
			}
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

/* A bank transfer or cash payment, recorded by the admin who received it.
   The payment trigger marks the invoice paid at zero balance and makes an
   awaiting-payment student active. */
export const recordPayment = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const amount = Number(o.amountKobo);
		const paidOn = String(o.paidOn ?? "");
		return {
			invoiceId: String(o.invoiceId ?? ""),
			amountKobo: Number.isInteger(amount) && amount > 0 ? amount : null,
			method: o.method === "cash" ? ("cash" as const) : ("transfer" as const),
			reference: String(o.reference ?? "")
				.trim()
				.slice(0, 120),
			paidOn: DATE.test(paidOn) ? paidOn : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (!data.amountKobo)
			return { ok: false, message: "Enter the amount paid." };
		if (!data.reference) {
			return {
				ok: false,
				message:
					"Enter a reference (the transfer reference or receipt number).",
			};
		}
		const amountKobo = data.amountKobo;
		try {
			const staff = await signedIn();
			await withStaff(staff.id, (db) =>
				db
					.insertInto("payments")
					.values({
						invoice_id: data.invoiceId,
						amount_kobo: amountKobo,
						method: data.method,
						reference: data.reference,
						recorded_by: staff.id,
						...(data.paidOn
							? {
									paid_at: sql<string>`(${data.paidOn}::date + time '12:00') at time zone 'Africa/Lagos'`,
								}
							: {}),
					})
					.execute(),
			);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});
