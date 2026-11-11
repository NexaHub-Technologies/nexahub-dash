import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import { withStaff } from "./db.server";
import { neonAuth } from "./neon-auth.server";

export type Staff = {
	id: string;
	full_name: string;
	email: string;
	role: "admin" | "instructor";
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/* The signed-in member of staff, or null. A valid login is not enough: the
   person must also have an active row in staff, which is the same check the
   database's policies make, so a deactivated account is turned away here at
   the door as well as at every query. */
export const getStaff = createServerFn({ method: "GET" }).handler(
	async (): Promise<Staff | null> => {
		const { data } = await neonAuth().getSession();
		const id = data?.user?.id;
		if (!id || !UUID.test(id)) return null;
		const row = await withStaff(id, (db) =>
			db
				.selectFrom("staff")
				.select(["id", "full_name", "email", "role"])
				.where("id", "=", id)
				.where("active", "=", true)
				.executeTakeFirst(),
		);
		return row ?? null;
	},
);

export type Student = {
	id: string;
	full_name: string;
	email: string;
	/* their Neon Auth user: who the database sees them as */
	auth_id: string;
};

/* The signed-in student, or null. A student's login is a Neon Auth user
   that a student row points at (students.auth_user_id); my_profile() finds
   that row from the session's user id. Staff are never students: someone
   with both is taken to the staff console. */
export const getStudent = createServerFn({ method: "GET" }).handler(
	async (): Promise<Student | null> => {
		const { data } = await neonAuth().getSession();
		const id = data?.user?.id;
		if (!id || !UUID.test(id)) return null;
		const { rows } = await withStaff(id, (db) =>
			sql<Omit<Student, "auth_id">>`
				select id, full_name, email from public.my_profile()`.execute(db),
		);
		return rows[0] ? { ...rows[0], auth_id: id } : null;
	},
);

/* Who is signed in, for the two front doors: the staff console and the
   student portal. One session read, then the staff row and only then the
   student row. */
export const getViewer = createServerFn({ method: "GET" }).handler(
	async (): Promise<
		| { staff: Staff; student?: undefined }
		| { student: Student; staff?: undefined }
		| null
	> => {
		const staff = await getStaff();
		if (staff) return { staff };
		const student = await getStudent();
		return student ? { student } : null;
	},
);
