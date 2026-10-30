import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { withStaff } from "./db.server";
import { type Outcome, refusal } from "./outcome";

/* Applications sent from the website's enrol form, and the review that turns
   one into a student. Admins only: RLS hides applications from everyone
   else, and approve_application / decline_application check again. */

export type ApplicationStatus = "new" | "approved" | "declined";
const STATUSES: readonly ApplicationStatus[] = ["new", "approved", "declined"];

export type ApplicationRow = {
	id: string;
	full_name: string;
	email: string;
	course_slug: string;
	course: string;
	mode: string;
	status: ApplicationStatus;
	created_at: string;
};

export type ApplicationDetail = ApplicationRow & {
	phone: string;
	gender: string;
	employment: string;
	has_experience: boolean;
	experience_detail: string;
	has_laptop: boolean;
	heard_from: string;
	can_commit: boolean;
	comments: string;
	notify_consent: boolean;
	decline_reason: string | null;
	reviewed_at: string | null;
	reviewer: string | null;
	course_fee_kobo: number;
	student_id: string | null;
};

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

export const listApplications = createServerFn({ method: "GET" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			status: STATUSES.includes(o.status as ApplicationStatus)
				? (o.status as ApplicationStatus)
				: undefined,
			q: typeof o.q === "string" ? o.q.trim().slice(0, 100) : "",
			course: typeof o.course === "string" ? o.course : "",
		};
	})
	.handler(async ({ data }) => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			let q = db
				.selectFrom("applications as a")
				.leftJoin("courses as c", "c.slug", "a.course_slug")
				.select([
					"a.id",
					"a.full_name",
					"a.email",
					"a.course_slug",
					"a.mode",
					"a.status",
					"a.created_at",
					sql<string>`coalesce(c.title, a.course_slug)`.as("course"),
				])
				.orderBy("a.created_at", "desc")
				.limit(200);
			if (data.status) q = q.where("a.status", "=", data.status);
			if (data.course) q = q.where("a.course_slug", "=", data.course);
			if (data.q) {
				const like = `%${data.q.replace(/[%_\\]/g, "\\$&")}%`;
				q = q.where((eb) =>
					eb.or([
						eb("a.full_name", "ilike", like),
						eb("a.email", "ilike", like),
					]),
				);
			}
			const rows = await q.execute();

			const counts = await db
				.selectFrom("applications")
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
					(r): ApplicationRow => ({
						...r,
						status: r.status as ApplicationStatus,
						created_at: new Date(r.created_at).toISOString(),
					}),
				),
				counts: Object.fromEntries(
					counts.map((c) => [String(c.status), Number(c.n)]),
				) as Partial<Record<ApplicationStatus, number>>,
				courses,
			};
		});
	});

export const getApplication = createServerFn({ method: "GET" })
	.validator((id: unknown) => String(id ?? ""))
	.handler(async ({ data: id }): Promise<ApplicationDetail | null> => {
		if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const a = await db
				.selectFrom("applications as a")
				.leftJoin("courses as c", "c.slug", "a.course_slug")
				.leftJoin("staff as s", "s.id", "a.reviewed_by")
				.leftJoin("students as st", "st.application_id", "a.id")
				.selectAll("a")
				.select([
					sql<string>`coalesce(c.title, a.course_slug)`.as("course"),
					sql<string>`coalesce(c.default_fee_kobo, 0)::text`.as("course_fee"),
					"s.full_name as reviewer",
					"st.id as linked_student",
				])
				.where("a.id", "=", id)
				.executeTakeFirst();
			if (!a) return null;
			/* the student this application became: linked directly, or found
			   by email when the person was already a student */
			const student =
				a.linked_student ??
				(
					await db
						.selectFrom("students")
						.select("id")
						.where(sql<boolean>`lower(email) = lower(${a.email})`)
						.executeTakeFirst()
				)?.id ??
				null;
			return {
				id: a.id,
				full_name: a.full_name,
				email: a.email,
				course_slug: a.course_slug,
				course: a.course,
				mode: a.mode,
				status: a.status as ApplicationStatus,
				created_at: new Date(a.created_at).toISOString(),
				phone: a.phone,
				gender: a.gender,
				employment: a.employment,
				has_experience: a.has_experience,
				experience_detail: a.experience_detail,
				has_laptop: a.has_laptop,
				heard_from: a.heard_from,
				can_commit: a.can_commit,
				comments: a.comments,
				notify_consent: a.notify_consent,
				decline_reason: a.decline_reason,
				reviewed_at: iso(a.reviewed_at),
				reviewer: a.reviewer,
				course_fee_kobo: Number(a.course_fee),
				student_id: a.status === "approved" ? student : null,
			};
		});
	});

const DATE = /^\d{4}-\d{2}-\d{2}$/;

/* Approve: enrols the applicant in their course and invoices the fee. The
   student waits for payment; the first payment makes them active. */
export const approveApplication = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const fee = Number(o.feeKobo);
		return {
			id: String(o.id ?? ""),
			startsOn: DATE.test(String(o.startsOn)) ? String(o.startsOn) : null,
			dueOn: DATE.test(String(o.dueOn)) ? String(o.dueOn) : null,
			feeKobo: Number.isInteger(fee) && fee >= 0 ? fee : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome<{ studentId: string }>> => {
		if (data.feeKobo === null) return { ok: false, message: "Enter the fee." };
		try {
			const staff = await signedIn();
			const studentId = await withStaff(staff.id, async (db) => {
				const { rows } = await sql<{ id: string }>`
					select public.approve_application(
						${data.id}::uuid,
						p_starts_on => ${data.startsOn}::date,
						p_fee_kobo => ${data.feeKobo}::bigint,
						p_due_on => ${data.dueOn}::date
					) as id`.execute(db);
				const enrolment = rows[0]?.id;
				const e = await db
					.selectFrom("enrolments")
					.select("student_id")
					.where("id", "=", String(enrolment))
					.executeTakeFirstOrThrow();
				return e.student_id;
			});
			return { ok: true, data: { studentId } };
		} catch (e) {
			return refusal(e);
		}
	});

export const declineApplication = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const reason = String(o.reason ?? "").trim();
		return {
			id: String(o.id ?? ""),
			reason: reason ? reason.slice(0, 500) : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			await withStaff(staff.id, (db) =>
				sql`select public.decline_application(${data.id}::uuid, ${data.reason})`.execute(
					db,
				),
			);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});
