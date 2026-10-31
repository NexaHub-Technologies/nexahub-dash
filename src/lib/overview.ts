import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { courseMetrics } from "./catalogue";
import { withStaff } from "./db.server";

/* The headline figures shown above every page, and the dashboard's queues
   and lists. Everything runs under the signed-in person's row-level
   security, so the student, fee and application figures come back empty for
   anyone but an admin. "Today" is today in Lagos. */

export type OverviewStats = {
	newApplications: number;
	students: number;
	courses: number;
	overdueInvoices: number;
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
				(select count(distinct student_id) from public.enrolments where status = 'active') as "students",
				(select count(*) from public.courses) as "courses",
				(select count(*) from public.invoice_balances
					where status = 'open' and balance_kobo > 0 and due_on < ${today}) as "overdueInvoices"`.execute(
				db,
			);
			const r = rows[0];
			return {
				newApplications: Number(r?.newApplications ?? 0),
				students: Number(r?.students ?? 0),
				courses: Number(r?.courses ?? 0),
				overdueInvoices: Number(r?.overdueInvoices ?? 0),
			};
		});
	},
);

export type Dashboard = {
	attention: {
		newApplications: number;
		overdueInvoices: number;
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
	courses: {
		slug: string;
		title: string;
		applicants: number;
		activeStudents: number;
	}[];
};

export const getDashboard = createServerFn({ method: "GET" }).handler(
	async (): Promise<Dashboard> => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const { rows: counts } = await sql<Record<string, string>>`select
				(select count(*) from public.applications where status = 'new') as new_applications,
				(select count(*) from public.invoice_balances
					where status = 'open' and balance_kobo > 0 and due_on < ${today}) as overdue_invoices,
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

			// the busiest courses: most students now, then most applicants
			const courses = (await courseMetrics(db)).slice(0, 5);

			return {
				attention: {
					newApplications: n("new_applications"),
					overdueInvoices: n("overdue_invoices"),
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
				courses: courses.map(({ slug, title, applicants, activeStudents }) => ({
					slug,
					title,
					applicants,
					activeStudents,
				})),
			};
		});
	},
);
