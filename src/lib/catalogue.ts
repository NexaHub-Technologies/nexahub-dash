import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { getStaff } from "./auth";
import { withStaff } from "./db.server";

/* The courses and their modules, as copied from the website by its
   scripts/sync-courses.ts. Read-only here: the website is where the
   curriculum is written. */

export type CourseSummary = {
	slug: string;
	title: string;
	feeKobo: number;
	modules: number;
	activeCohorts: number;
	updatedAt: string;
};

export type CourseDetail = CourseSummary & {
	moduleList: { n: number; title: string }[];
};

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

export const listCourses = createServerFn({ method: "GET" }).handler(
	async (): Promise<CourseSummary[]> => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const rows = await db
				.selectFrom("courses as c")
				.select((eb) => [
					"c.slug",
					"c.title",
					"c.default_fee_kobo",
					"c.updated_at",
					eb
						.selectFrom("course_modules as m")
						.whereRef("m.course_slug", "=", "c.slug")
						.select(eb.fn.countAll<string>().as("n"))
						.as("modules"),
					eb
						.selectFrom("cohorts as h")
						.whereRef("h.course_slug", "=", "c.slug")
						.where(
							sql<boolean>`h.ends_on >= (now() at time zone 'Africa/Lagos')::date`,
						)
						.select(eb.fn.countAll<string>().as("n"))
						.as("active_cohorts"),
				])
				.orderBy("c.title")
				.execute();
			return rows.map((r) => ({
				slug: r.slug,
				title: r.title,
				feeKobo: Number(r.default_fee_kobo),
				modules: Number(r.modules ?? 0),
				activeCohorts: Number(r.active_cohorts ?? 0),
				updatedAt: new Date(r.updated_at).toISOString(),
			}));
		});
	},
);

export const getCourse = createServerFn({ method: "GET" })
	.validator((slug: unknown) => String(slug ?? ""))
	.handler(async ({ data: slug }): Promise<CourseDetail | null> => {
		const all = await listCourses();
		const course = all.find((c) => c.slug === slug);
		if (!course) return null;
		const staff = await signedIn();
		const moduleList = await withStaff(staff.id, (db) =>
			db
				.selectFrom("course_modules")
				.select(["n", "title"])
				.where("course_slug", "=", slug)
				.orderBy("n")
				.execute(),
		);
		return { ...course, moduleList };
	});
