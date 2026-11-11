import { randomInt, randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { hashPassword } from "better-auth/crypto";
import { sql } from "kysely";
import {
	type AssessmentKind,
	type Grade,
	isGrade,
	isKind,
} from "./assessment-status";
import { getStaff } from "./auth";
import { withStaff } from "./db.server";
import {
	keyName,
	sizeProblem,
	type UploadTicket,
	uploadRequest,
} from "./files";
import { type Outcome, refusal } from "./outcome";
import type { EnrolmentStatus } from "./status";
import { removeStored, signUpload, storedSize } from "./storage.server";

/* Assessments as the admin works them: each course's track of projects and
   exercises, typed in by hand; who each is assigned to; opening and locking;
   the files either way; and the grades. Admins only: row-level security
   returns nothing to anyone else, so every change below that touches no row
   answers "only an admin". Students reach their own work through the
   portal (portal.ts), never through these. */

export type AssessmentRow = {
	id: string;
	course_slug: string;
	course: string;
	kind: AssessmentKind;
	title: string;
	files: number;
	assigned: number;
	locked: number;
	toMark: number;
	marked: number;
};

export type StoredFile = {
	id: string;
	name: string;
	size_bytes: number;
	created_at: string;
	/* on a submission: who added it, or null for the student's own upload */
	staff?: string | null;
};

export type AssignmentRow = {
	id: string;
	student_id: string;
	full_name: string;
	enrolment_status: EnrolmentStatus;
	locked: boolean;
	due_on: string | null;
	grade: Grade | null;
	feedback: string | null;
	marked_at: string | null;
	files: StoredFile[];
};

export type AssessmentDetail = {
	id: string;
	course_slug: string;
	course: string;
	kind: AssessmentKind;
	title: string;
	brief: string;
	position: number;
	files: StoredFile[];
	assignments: AssignmentRow[];
	/* enrolments on the course that don't have this work yet */
	unassigned: {
		enrolment_id: string;
		full_name: string;
		status: EnrolmentStatus;
	}[];
};

export type StudentCoursework = {
	hasLogin: boolean;
	loginEmail: string;
	assignments: {
		id: string;
		assessment_id: string;
		course: string;
		kind: AssessmentKind;
		title: string;
		locked: boolean;
		submitted: boolean;
		grade: Grade | null;
		due_on: string | null;
	}[];
};

async function signedIn() {
	const staff = await getStaff();
	if (!staff) throw new Error("Not signed in");
	return staff;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const uuid = (v: unknown) => (UUID.test(String(v ?? "")) ? String(v) : "");
const iso = (d: unknown) => new Date(d as string).toISOString();
const dateText = (d: unknown) =>
	d instanceof Date ? d.toISOString().slice(0, 10) : d ? String(d) : null;
const ADMIN_ONLY = "Only an admin can manage assessments.";

export const listAssessments = createServerFn({ method: "GET" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return { course: typeof o.course === "string" ? o.course : "" };
	})
	.handler(async ({ data }) => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const { rows } = await sql<Record<string, unknown>>`
				select a.id, a.course_slug, coalesce(c.title, a.course_slug) as course,
					a.kind::text, a.title,
					(select count(*) from public.assessment_files f where f.assessment_id = a.id) as files,
					count(g.id) as assigned,
					count(g.id) filter (where g.opened_at is null and g.grade is null) as locked,
					count(g.id) filter (where g.grade is null and exists (
						select 1 from public.submission_files f
						where f.assignment_id = g.id and f.staff_id is null)) as to_mark,
					count(g.id) filter (where g.grade is not null) as marked
				from public.assessments a
				left join public.courses c on c.slug = a.course_slug
				left join public.assignments g on g.assessment_id = a.id
				where ${data.course ? sql`a.course_slug = ${data.course}` : sql`true`}
				group by a.id, c.title
				order by coalesce(c.title, a.course_slug), a.position, a.created_at`.execute(
				db,
			);
			const courses = await db
				.selectFrom("courses")
				.select(["slug", "title"])
				.orderBy("title")
				.execute();
			return {
				rows: rows.map(
					(r): AssessmentRow => ({
						id: String(r.id),
						course_slug: String(r.course_slug),
						course: String(r.course),
						kind: r.kind as AssessmentKind,
						title: String(r.title),
						files: Number(r.files),
						assigned: Number(r.assigned),
						locked: Number(r.locked),
						toMark: Number(r.to_mark),
						marked: Number(r.marked),
					}),
				),
				courses,
			};
		});
	});

export const getAssessment = createServerFn({ method: "GET" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<AssessmentDetail | null> => {
		const staff = await signedIn();
		if (!id) return null;
		return withStaff(staff.id, async (db) => {
			const a = await db
				.selectFrom("assessments as a")
				.leftJoin("courses as c", "c.slug", "a.course_slug")
				.select([
					"a.id",
					"a.course_slug",
					"a.kind",
					"a.title",
					"a.brief",
					"a.position",
					sql<string>`coalesce(c.title, a.course_slug)`.as("course"),
				])
				.where("a.id", "=", id)
				.executeTakeFirst();
			if (!a) return null;

			const files = await db
				.selectFrom("assessment_files")
				.select(["id", "name", "size_bytes", "created_at"])
				.where("assessment_id", "=", id)
				.orderBy("created_at")
				.execute();

			const assignments = await db
				.selectFrom("assignments as g")
				.innerJoin("enrolments as e", "e.id", "g.enrolment_id")
				.innerJoin("students as s", "s.id", "e.student_id")
				.select([
					"g.id",
					"g.opened_at",
					"g.due_on",
					"g.grade",
					"g.feedback",
					"g.marked_at",
					"e.status",
					"s.id as student_id",
					"s.full_name",
				])
				.where("g.assessment_id", "=", id)
				.orderBy("s.full_name")
				.execute();
			const ids = assignments.map((g) => g.id);
			const submitted = ids.length
				? await db
						.selectFrom("submission_files as f")
						.leftJoin("staff as st", "st.id", "f.staff_id")
						.select([
							"f.id",
							"f.assignment_id",
							"f.name",
							"f.size_bytes",
							"f.created_at",
							"st.full_name as staff",
						])
						.where("f.assignment_id", "in", ids)
						.orderBy("f.created_at")
						.execute()
				: [];

			const { rows: unassigned } = await sql<Record<string, string>>`
				select e.id as enrolment_id, s.full_name, e.status::text
				from public.enrolments e
				join public.students s on s.id = e.student_id
				where e.course_slug = ${a.course_slug}
					and e.status <> 'withdrawn'
					and not exists (select 1 from public.assignments g
						where g.assessment_id = ${id} and g.enrolment_id = e.id)
				order by s.full_name`.execute(db);

			return {
				id: a.id,
				course_slug: a.course_slug,
				course: a.course,
				kind: a.kind as AssessmentKind,
				title: a.title,
				brief: a.brief,
				position: a.position,
				files: files.map((f) => ({
					id: f.id,
					name: f.name,
					size_bytes: Number(f.size_bytes),
					created_at: iso(f.created_at),
				})),
				assignments: assignments.map((g) => ({
					id: g.id,
					student_id: g.student_id,
					full_name: g.full_name,
					enrolment_status: g.status as EnrolmentStatus,
					locked: g.opened_at === null,
					due_on: dateText(g.due_on),
					grade: g.grade,
					feedback: g.feedback,
					marked_at: g.marked_at ? iso(g.marked_at) : null,
					files: submitted
						.filter((f) => f.assignment_id === g.id)
						.map((f) => ({
							id: f.id,
							name: f.name,
							size_bytes: Number(f.size_bytes),
							created_at: iso(f.created_at),
							staff: f.staff,
						})),
				})),
				unassigned: unassigned.map((u) => ({
					enrolment_id: u.enrolment_id,
					full_name: u.full_name,
					status: u.status as EnrolmentStatus,
				})),
			};
		});
	});

function assessmentFields(o: Record<string, unknown>) {
	return {
		kind: isKind(o.kind) ? o.kind : null,
		title: String(o.title ?? "")
			.trim()
			.slice(0, 160),
		brief: String(o.brief ?? "")
			.trim()
			.slice(0, 5000),
	};
}

/* Adds a piece of work to the end of a course's track and, when asked,
   gives it to everyone active on the course: exercises open, projects
   locked until the admin opens them. */
export const createAssessment = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			...assessmentFields(o),
			course: String(o.course ?? ""),
			assign: o.assign === true,
		};
	})
	.handler(async ({ data }): Promise<Outcome<{ id: string }>> => {
		if (!data.course) return { ok: false, message: "Choose a course." };
		if (!data.kind)
			return { ok: false, message: "Choose project or exercise." };
		if (!data.title) return { ok: false, message: "Give it a title." };
		const { kind, title, brief, course } = data;
		try {
			const staff = await signedIn();
			return await withStaff(staff.id, async (db) => {
				const { rows } = await sql<{ id: string }>`
					insert into public.assessments (course_slug, kind, title, brief, position)
					values (${course}, ${kind}, ${title}, ${brief},
						(select coalesce(max(position), 0) + 1 from public.assessments where course_slug = ${course}))
					returning id`.execute(db);
				const id = rows[0]?.id;
				if (!id) return { ok: false as const, message: ADMIN_ONLY };
				let note: string | undefined;
				if (data.assign) {
					const r = await sql`
						insert into public.assignments (assessment_id, enrolment_id, opened_at)
						select ${id}, e.id, ${kind === "exercise" ? sql`now()` : sql`null`}
						from public.enrolments e
						where e.course_slug = ${course} and e.status = 'active'`.execute(
						db,
					);
					const n = Number(r.numAffectedRows ?? 0);
					note = n
						? `Assigned to ${n} active ${n === 1 ? "student" : "students"}${kind === "project" ? ", locked" : ""}.`
						: "Nobody is active on this course yet, so it is assigned to no one.";
				}
				return { ok: true as const, note, data: { id } };
			});
		} catch (e) {
			return refusal(e);
		}
	});

export const updateAssessment = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const position = Number(o.position);
		return {
			...assessmentFields(o),
			id: uuid(o.id),
			position:
				Number.isInteger(position) && position >= 0 && position <= 9999
					? position
					: null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (!data.kind)
			return { ok: false, message: "Choose project or exercise." };
		if (!data.title) return { ok: false, message: "Give it a title." };
		if (data.position === null) {
			return { ok: false, message: "The order is a whole number." };
		}
		const { kind, title, brief, position } = data;
		try {
			const staff = await signedIn();
			const r = await withStaff(staff.id, (db) =>
				db
					.updateTable("assessments")
					.set({ kind, title, brief, position })
					.where("id", "=", data.id)
					.executeTakeFirst(),
			);
			return r.numUpdatedRows
				? { ok: true }
				: { ok: false, message: ADMIN_ONLY };
		} catch (e) {
			return refusal(e);
		}
	});

/* Deletes the work for everyone: its brief files, every student's uploads
   and their grades go with it. */
export const deleteAssessment = createServerFn({ method: "POST" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			const keys = await withStaff(staff.id, async (db) => {
				const { rows } = await sql<{ storage_key: string }>`
					select storage_key from public.assessment_files where assessment_id = ${id}
					union all
					select f.storage_key from public.submission_files f
					join public.assignments g on g.id = f.assignment_id
					where g.assessment_id = ${id}`.execute(db);
				const r = await db
					.deleteFrom("assessments")
					.where("id", "=", id)
					.executeTakeFirst();
				return r.numDeletedRows ? rows.map((k) => k.storage_key) : null;
			});
			if (!keys) return { ok: false, message: ADMIN_ONLY };
			await removeStored(keys);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

/* Gives the work to the chosen students, or to everyone on the course who
   doesn't have it yet and hasn't withdrawn. */
export const assignStudents = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const due = String(o.dueOn ?? "");
		return {
			assessmentId: uuid(o.assessmentId),
			enrolmentIds: Array.isArray(o.enrolmentIds)
				? o.enrolmentIds.map(uuid).filter(Boolean).slice(0, 500)
				: [],
			open: o.open === true,
			dueOn: DATE.test(due) ? due : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (!data.enrolmentIds.length) {
			return { ok: false, message: "Choose at least one student." };
		}
		try {
			const staff = await signedIn();
			const n = await withStaff(staff.id, async (db) => {
				const r = await db
					.insertInto("assignments")
					.values(
						data.enrolmentIds.map((enrolment_id) => ({
							assessment_id: data.assessmentId,
							enrolment_id,
							opened_at: data.open ? sql<Date>`now()` : null,
							due_on: data.dueOn,
						})),
					)
					.onConflict((oc) =>
						oc.columns(["assessment_id", "enrolment_id"]).doNothing(),
					)
					.executeTakeFirst();
				return Number(r.numInsertedOrUpdatedRows ?? 0);
			});
			return {
				ok: true,
				note: `${n} ${n === 1 ? "student" : "students"} assigned${data.open ? "" : ", locked"}.`,
			};
		} catch (e) {
			return refusal(e);
		}
	});

/* Opens or locks the work: for the students named, or for everyone it is
   assigned to. Opening keeps the first time it was opened. */
export const setAssignmentsOpen = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			assessmentId: uuid(o.assessmentId),
			assignmentIds: Array.isArray(o.assignmentIds)
				? o.assignmentIds.map(uuid).filter(Boolean).slice(0, 500)
				: null,
			open: o.open === true,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			const n = await withStaff(staff.id, async (db) => {
				let q = db
					.updateTable("assignments")
					.set({
						opened_at: data.open ? sql<Date>`coalesce(opened_at, now())` : null,
					})
					.where("assessment_id", "=", data.assessmentId)
					.where("opened_at", data.open ? "is" : "is not", null);
				if (data.assignmentIds) {
					if (!data.assignmentIds.length) return 0;
					q = q.where("id", "in", data.assignmentIds);
				}
				return Number((await q.executeTakeFirst()).numUpdatedRows);
			});
			const who = `${n} ${n === 1 ? "student" : "students"}`;
			return {
				ok: true,
				note: n
					? data.open
						? `${who} can now see the brief and upload their work.`
						: `${who} now see the title only.`
					: data.open
						? "It was already open for everyone it is assigned to."
						: "It was already locked for everyone it is assigned to.",
			};
		} catch (e) {
			return refusal(e);
		}
	});

/* The admin's mark for one student: a grade in words (none clears it),
   feedback, and the due date. */
export const markAssignment = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		const due = String(o.dueOn ?? "");
		return {
			id: uuid(o.id),
			grade: isGrade(o.grade) ? o.grade : null,
			feedback:
				String(o.feedback ?? "")
					.trim()
					.slice(0, 4000) || null,
			dueOn: DATE.test(due) ? due : null,
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			const r = await withStaff(staff.id, (db) =>
				db
					.updateTable("assignments")
					.set({
						grade: data.grade,
						feedback: data.feedback,
						due_on: data.dueOn,
					})
					.where("id", "=", data.id)
					.executeTakeFirst(),
			);
			return r.numUpdatedRows
				? { ok: true }
				: { ok: false, message: ADMIN_ONLY };
		} catch (e) {
			return refusal(e);
		}
	});

/* Takes the work away from one student, with their uploads and mark. */
export const removeAssignment = createServerFn({ method: "POST" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			const keys = await withStaff(staff.id, async (db) => {
				const files = await db
					.selectFrom("submission_files")
					.select("storage_key")
					.where("assignment_id", "=", id)
					.execute();
				const r = await db
					.deleteFrom("assignments")
					.where("id", "=", id)
					.executeTakeFirst();
				return r.numDeletedRows ? files.map((f) => f.storage_key) : null;
			});
			if (!keys) return { ok: false, message: ADMIN_ONLY };
			await removeStored(keys);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

/* ── files ──────────────────────────────────────────────────────────────
   An upload is two calls around the browser's own POST to storage: the
   first checks the admin may add a file there and signs a link for one
   file at one key; the second, after the browser has sent the file,
   confirms it arrived and records it. `brief` files belong to an
   assessment; `submission` files to one student's assignment, added on
   their behalf or handed back with the mark. */

export type UploadTarget = "brief" | "submission";
const isTarget = (v: unknown): v is UploadTarget =>
	v === "brief" || v === "submission";
const folder = (target: UploadTarget, id: string) =>
	`${target === "brief" ? "briefs" : "submissions"}/${id}/`;

export const startUpload = createServerFn({ method: "POST" })
	.validator((d: unknown) => ({
		...uploadRequest(d),
		target: isTarget((d as { target?: unknown })?.target)
			? (d as { target: UploadTarget }).target
			: null,
	}))
	.handler(async ({ data }): Promise<Outcome<UploadTicket>> => {
		const { target } = data;
		if (!target || !data.id)
			return { ok: false, message: "Nothing to add to." };
		const problem = sizeProblem(data.size);
		if (problem) return { ok: false, message: problem };
		try {
			const staff = await signedIn();
			const found = await withStaff(staff.id, (db) =>
				db
					.selectFrom(target === "brief" ? "assessments" : "assignments")
					.select("id")
					.where("id", "=", data.id)
					.executeTakeFirst(),
			);
			if (!found) return { ok: false, message: ADMIN_ONLY };
			const key = `${folder(target, data.id)}${randomUUID()}/${keyName(data.name)}`;
			return {
				ok: true,
				data: { ...(await signUpload(key, data.type)), key },
			};
		} catch (e) {
			return refusal(e);
		}
	});

export const finishUpload = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			...uploadRequest(d),
			target: isTarget(o.target) ? o.target : null,
			key: String(o.key ?? ""),
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		const { target } = data;
		if (!target || !data.id || !data.key.startsWith(folder(target, data.id))) {
			return { ok: false, message: "That upload doesn't belong here." };
		}
		try {
			const staff = await signedIn();
			const size = await storedSize(data.key);
			if (!size) {
				return { ok: false, message: "The file didn't arrive. Try again." };
			}
			const row = {
				name: data.name,
				storage_key: data.key,
				size_bytes: size,
				content_type: data.type,
			};
			await withStaff(staff.id, (db) =>
				target === "brief"
					? db
							.insertInto("assessment_files")
							.values({ ...row, assessment_id: data.id })
							.execute()
					: db
							.insertInto("submission_files")
							.values({ ...row, assignment_id: data.id, staff_id: staff.id })
							.execute(),
			);
			return { ok: true };
		} catch (e) {
			// the row was refused, so the file it would have pointed at goes too
			await removeStored([data.key]);
			return refusal(e);
		}
	});

export const deleteFile = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return { target: isTarget(o.target) ? o.target : null, id: uuid(o.id) };
	})
	.handler(async ({ data }): Promise<Outcome> => {
		const { target } = data;
		if (!target) return { ok: false, message: "No such file." };
		try {
			const staff = await signedIn();
			const gone = await withStaff(staff.id, (db) =>
				db
					.deleteFrom(
						target === "brief" ? "assessment_files" : "submission_files",
					)
					.where("id", "=", data.id)
					.returning("storage_key")
					.executeTakeFirst(),
			);
			if (!gone) return { ok: false, message: ADMIN_ONLY };
			await removeStored([gone.storage_key]);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

/* ── on a student's page ──────────────────────────────────────────────── */

export const getStudentCoursework = createServerFn({ method: "GET" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<StudentCoursework> => {
		const staff = await signedIn();
		return withStaff(staff.id, async (db) => {
			const s = id
				? await db
						.selectFrom("students")
						.select(["auth_user_id", "email"])
						.where("id", "=", id)
						.executeTakeFirst()
				: undefined;
			const { rows } = await sql<Record<string, unknown>>`
				select g.id, a.id as assessment_id, coalesce(c.title, a.course_slug) as course,
					a.kind::text, a.title, g.opened_at is null as locked,
					exists (select 1 from public.submission_files f
						where f.assignment_id = g.id and f.staff_id is null) as submitted,
					g.grade::text, g.due_on::text
				from public.assignments g
				join public.assessments a on a.id = g.assessment_id
				join public.enrolments e on e.id = g.enrolment_id
				left join public.courses c on c.slug = a.course_slug
				where e.student_id = ${id || null}
				order by coalesce(c.title, a.course_slug), a.position, a.created_at`.execute(
				db,
			);
			return {
				hasLogin: Boolean(s?.auth_user_id),
				loginEmail: (s?.email ?? "").toLowerCase(),
				assignments: rows.map((r) => ({
					id: String(r.id),
					assessment_id: String(r.assessment_id),
					course: String(r.course),
					kind: r.kind as AssessmentKind,
					title: String(r.title),
					locked: Boolean(r.locked),
					submitted: Boolean(r.submitted),
					grade: (r.grade as Grade | null) ?? null,
					due_on: (r.due_on as string | null) ?? null,
				})),
			};
		});
	});

/* A password a person can read out and type: three groups of four, with no
   look-alike characters (no 0/o, 1/l/i). About 59 bits, drawn from the
   system's secure random source. */
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function newPassword() {
	const group = () =>
		Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join(
			"",
		);
	return `${group()}-${group()}-${group()}`;
}

/* Creates a student's login, or replaces its password. The password is
   made here and shown to the admin once, to pass on; only its hash is
   stored, the way Neon Auth stores one. */
export const setStudentLogin = createServerFn({ method: "POST" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<Outcome<{ password: string }>> => {
		try {
			const staff = await signedIn();
			const password = newPassword();
			const hash = await hashPassword(password);
			await withStaff(staff.id, (db) =>
				sql`select public.set_student_login(${id}::uuid, ${hash})`.execute(db),
			);
			return { ok: true, data: { password } };
		} catch (e) {
			return refusal(e);
		}
	});

export const removeStudentLogin = createServerFn({ method: "POST" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<Outcome> => {
		try {
			const staff = await signedIn();
			await withStaff(staff.id, (db) =>
				sql`select public.remove_student_login(${id}::uuid)`.execute(db),
			);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});
