import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { type Db, withStaff } from "./db.server";

/* How each course is doing: who has applied and who is studying. The
   course list is whatever is in public.courses; a course the website adds
   registers itself with its first application (see migration
   20261031090000_courses_from_applications.sql), so nothing is copied from
   the website by hand. Everything runs under the signed-in person's
   row-level security, so applications count only for admins. */

export type CourseMetrics = {
	slug: string;
	title: string;
	applicants: number;
	waiting: number;
	approved: number;
	activeStudents: number;
	completed: number;
	activeCohorts: number;
};

export type CourseDetail = CourseMetrics & {
	recentApplicants: {
		id: string;
		full_name: string;
		status: string;
		created_at: string;
	}[];
	cohorts: {
		id: string;
		name: string;
		starts_on: string;
		ends_on: string;
		activeStudents: number;
	}[];
};

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

const today = sql<string>`(now() at time zone 'Africa/Lagos')::date`;

export async function courseMetrics(
	db: Db,
	slug?: string,
): Promise<CourseMetrics[]> {
	const { rows } = await sql<Record<string, string>>`
		select
			c.slug,
			c.title,
			(select count(*) from public.applications a where a.course_slug = c.slug) as applicants,
			(select count(*) from public.applications a
				where a.course_slug = c.slug and a.status = 'new') as waiting,
			(select count(*) from public.applications a
				where a.course_slug = c.slug and a.status = 'approved') as approved,
			(select count(distinct e.student_id) from public.enrolments e
				join public.cohorts h on h.id = e.cohort_id
				where h.course_slug = c.slug and e.status = 'active') as active_students,
			(select count(distinct e.student_id) from public.enrolments e
				join public.cohorts h on h.id = e.cohort_id
				where h.course_slug = c.slug and e.status = 'completed') as completed,
			(select count(*) from public.cohorts h
				where h.course_slug = c.slug and h.ends_on >= ${today}) as active_cohorts
		from public.courses c
		where ${slug === undefined ? sql`true` : sql`c.slug = ${slug}`}
		order by active_students desc, applicants desc, c.title`.execute(db);
	return rows.map((r) => ({
		slug: String(r.slug),
		title: String(r.title),
		applicants: Number(r.applicants),
		waiting: Number(r.waiting),
		approved: Number(r.approved),
		activeStudents: Number(r.active_students),
		completed: Number(r.completed),
		activeCohorts: Number(r.active_cohorts),
	}));
}

export const listCourseMetrics = createServerFn({ method: "GET" }).handler(
	async () => {
		const staff = await signedIn();
		return withStaff(staff.id, (db) => courseMetrics(db));
	},
);

export const getCourseMetrics = createServerFn({ method: "GET" })
	.validator((slug: unknown) => String(slug ?? ""))
	.handler(async ({ data: slug }): Promise<CourseDetail | null> => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const [course] = await courseMetrics(db, slug);
			if (!course) return null;

			const recentApplicants = await db
				.selectFrom("applications")
				.select(["id", "full_name", "status", "created_at"])
				.where("course_slug", "=", slug)
				.orderBy("created_at", "desc")
				.limit(5)
				.execute();

			const { rows: cohorts } = await sql<Record<string, string>>`
				select h.id, h.name, h.starts_on::text, h.ends_on::text,
					(select count(distinct e.student_id) from public.enrolments e
						where e.cohort_id = h.id and e.status = 'active') as active_students
				from public.cohorts h
				where h.course_slug = ${slug} and h.ends_on >= ${today}
				order by h.starts_on`.execute(db);

			return {
				...course,
				recentApplicants: recentApplicants.map((a) => ({
					id: a.id,
					full_name: a.full_name,
					status: String(a.status),
					created_at: new Date(a.created_at).toISOString(),
				})),
				cohorts: cohorts.map((h) => ({
					id: String(h.id),
					name: String(h.name),
					starts_on: String(h.starts_on),
					ends_on: String(h.ends_on),
					activeStudents: Number(h.active_students),
				})),
			};
		});
	});
