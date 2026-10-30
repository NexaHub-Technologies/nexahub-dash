import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { withStaff } from "./db.server";

/* The headline figures shown above every page, and the dashboard's queues
   and lists. Everything runs under the signed-in person's row-level
   security, so an instructor's figures cover only their own cohorts and the
   fee and application figures come back empty for them. "Today" is today
   in Lagos. */

export type OverviewStats = {
	newApplications: number;
	students: number;
	activeCohorts: number;
	courses: number;
};

const today = sql<string>`(now() at time zone 'Africa/Lagos')::date`;

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

export const getOverviewStats = createServerFn({ method: "GET" }).handler(
	async (): Promise<OverviewStats> => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const { rows } = await sql<{
				[K in keyof OverviewStats]: string;
			}>`select
				(select count(*) from public.applications where status = 'new') as "newApplications",
				(select count(*) from public.students) as "students",
				(select count(*) from public.cohorts where ends_on >= ${today}) as "activeCohorts",
				(select count(*) from public.courses) as "courses"`.execute(db);
			const r = rows[0];
			return {
				newApplications: Number(r?.newApplications ?? 0),
				students: Number(r?.students ?? 0),
				activeCohorts: Number(r?.activeCohorts ?? 0),
				courses: Number(r?.courses ?? 0),
			};
		});
	},
);

export type Dashboard = {
	attention: {
		newApplications: number;
		overdueInvoices: number;
		sessionsToday: number;
		failedMessages: number;
	};
	fees: {
		collectedThisMonthKobo: number;
		outstandingKobo: number;
		payments: number;
	};
	recentApplications: {
		id: string;
		full_name: string;
		course: string;
		status: string;
		created_at: string;
	}[];
	sessionsToday: {
		id: string;
		cohort: string;
		course: string;
		starts_at: string;
		cancelled: boolean;
	}[];
	courses: { slug: string; title: string; modules: number }[];
};

export const getDashboard = createServerFn({ method: "GET" }).handler(
	async (): Promise<Dashboard> => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const { rows: counts } = await sql<Record<string, string>>`select
				(select count(*) from public.applications where status = 'new') as new_applications,
				(select count(*) from public.invoice_balances
					where status = 'open' and balance_kobo > 0 and due_on < ${today}) as overdue_invoices,
				(select count(*) from public.sessions
					where not cancelled and (starts_at at time zone 'Africa/Lagos')::date = ${today}) as sessions_today,
				(select count(*) from public.notifications where status = 'failed') as failed_messages,
				(select coalesce(sum(amount_kobo), 0) from public.payments
					where date_trunc('month', paid_at at time zone 'Africa/Lagos')
					    = date_trunc('month', now() at time zone 'Africa/Lagos')) as collected,
				(select count(*) from public.payments
					where date_trunc('month', paid_at at time zone 'Africa/Lagos')
					    = date_trunc('month', now() at time zone 'Africa/Lagos')) as payments,
				(select coalesce(sum(balance_kobo), 0) from public.invoice_balances
					where status = 'open' and balance_kobo > 0) as outstanding`.execute(
				db,
			);
			const c = counts[0] ?? {};
			const n = (k: string) => Number(c[k] ?? 0);

			const recentApplications = await db
				.selectFrom("applications as a")
				.leftJoin("courses as c", "c.slug", "a.course_slug")
				.select([
					"a.id",
					"a.full_name",
					"a.status",
					"a.created_at",
					sql<string>`coalesce(c.title, a.course_slug)`.as("course"),
				])
				.orderBy("a.created_at", "desc")
				.limit(5)
				.execute();

			const sessionsToday = await db
				.selectFrom("sessions as s")
				.innerJoin("cohorts as h", "h.id", "s.cohort_id")
				.innerJoin("courses as c", "c.slug", "h.course_slug")
				.select([
					"s.id",
					"s.starts_at",
					"s.cancelled",
					"h.name as cohort",
					"c.title as course",
				])
				.where(
					sql<boolean>`(s.starts_at at time zone 'Africa/Lagos')::date = ${today}`,
				)
				.orderBy("s.starts_at")
				.limit(6)
				.execute();

			const courses = await db
				.selectFrom("courses as c")
				.leftJoin("course_modules as m", "m.course_slug", "c.slug")
				.select([
					"c.slug",
					"c.title",
					(eb) => eb.fn.count<string>("m.n").as("modules"),
				])
				.groupBy(["c.slug", "c.title"])
				.orderBy("c.title")
				.limit(5)
				.execute();

			return {
				attention: {
					newApplications: n("new_applications"),
					overdueInvoices: n("overdue_invoices"),
					sessionsToday: n("sessions_today"),
					failedMessages: n("failed_messages"),
				},
				fees: {
					collectedThisMonthKobo: n("collected"),
					outstandingKobo: n("outstanding"),
					payments: n("payments"),
				},
				recentApplications: recentApplications.map((a) => ({
					...a,
					status: String(a.status),
					created_at: new Date(a.created_at).toISOString(),
				})),
				sessionsToday: sessionsToday.map((s) => ({
					...s,
					starts_at: new Date(s.starts_at).toISOString(),
				})),
				courses: courses.map((c) => ({ ...c, modules: Number(c.modules) })),
			};
		});
	},
);
