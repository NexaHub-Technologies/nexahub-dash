import { randomUUID } from "node:crypto";
import { createServerFn } from "@tanstack/react-start";
import { sql } from "kysely";
import type { AssessmentKind } from "./assessment-status";
import { getStudent } from "./auth";
import { withStaff } from "./db.server";
import {
	keyName,
	sizeProblem,
	type UploadTicket,
	uploadRequest,
} from "./files";
import { neonAuth } from "./neon-auth.server";
import { type Outcome, refusal } from "./outcome";
import { removeStored, signUpload, storedSize } from "./storage.server";

/* The student portal: a student's own projects and exercises. Everything
   here goes through the database's my_* functions, which start from the
   signed-in student's own row, so there is no id a student could change to
   reach someone else's work. A locked piece of work comes back with its
   title and nothing more. */

export type MyWork = {
	id: string;
	course: string;
	kind: AssessmentKind;
	title: string;
	brief: string | null;
	max_score: number;
	locked: boolean;
	due_on: string | null;
	score: number | null;
	feedback: string | null;
	marked_at: string | null;
	submitted_at: string | null;
};

export type MyFile = {
	id: string;
	/* the brief's, the student's own upload, or one staff added */
	source: "brief" | "mine" | "staff";
	name: string;
	size_bytes: number;
	created_at: string;
};

async function signedIn() {
	const student = await getStudent();
	if (!student) throw new Error("Not signed in");
	return student;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const uuid = (v: unknown) => (UUID.test(String(v ?? "")) ? String(v) : "");
const iso = (d: unknown) => (d ? new Date(d as string).toISOString() : null);

const toWork = (r: Record<string, unknown>): MyWork => ({
	id: String(r.id),
	course: String(r.course),
	kind: r.kind as AssessmentKind,
	title: String(r.title),
	brief: (r.brief as string | null) ?? null,
	max_score: Number(r.max_score),
	locked: Boolean(r.locked),
	due_on: (r.due_on as string | null) ?? null,
	score: r.score === null ? null : Number(r.score),
	feedback: (r.feedback as string | null) ?? null,
	marked_at: iso(r.marked_at),
	submitted_at: iso(r.submitted_at),
});

const WORK = sql`id, course, kind::text, title, brief, max_score, locked,
	due_on::text, score, feedback, marked_at, submitted_at`;

export const listMyWork = createServerFn({ method: "GET" }).handler(
	async (): Promise<MyWork[]> => {
		const student = await signedIn();
		const { rows } = await withStaff(student.auth_id, (db) =>
			sql<
				Record<string, unknown>
			>`select ${WORK} from public.my_assignments()`.execute(db),
		);
		return rows.map(toWork);
	},
);

export const getMyWork = createServerFn({ method: "GET" })
	.validator((id: unknown) => uuid(id))
	.handler(
		async ({ data: id }): Promise<{ work: MyWork; files: MyFile[] } | null> => {
			const student = await signedIn();
			if (!id) return null;
			return withStaff(student.auth_id, async (db) => {
				const { rows } = await sql<Record<string, unknown>>`
					select ${WORK} from public.my_assignments() where id = ${id}`.execute(
					db,
				);
				const work = rows[0];
				if (!work) return null;
				const { rows: files } = await sql<Record<string, unknown>>`
					select id, source, name, size_bytes, created_at
					from public.my_assignment_files(${id}::uuid)`.execute(db);
				return {
					work: toWork(work),
					files: files.map((f) => ({
						id: String(f.id),
						source: f.source as MyFile["source"],
						name: String(f.name),
						size_bytes: Number(f.size_bytes),
						created_at: String(iso(f.created_at)),
					})),
				};
			});
		},
	);

const folder = (assignment: string) => `submissions/${assignment}/`;

/* Signs a link for one file of the student's work. Only for work that is
   theirs, open and not yet marked; the database checks the same again when
   the upload is recorded. */
export const startSubmission = createServerFn({ method: "POST" })
	.validator(uploadRequest)
	.handler(async ({ data }): Promise<Outcome<UploadTicket>> => {
		const problem = sizeProblem(data.size);
		if (problem) return { ok: false, message: problem };
		try {
			const student = await signedIn();
			const { rows } = await withStaff(student.auth_id, (db) =>
				sql<{ locked: boolean; score: number | null }>`
					select locked, score from public.my_assignments() where id = ${data.id}`.execute(
					db,
				),
			);
			const work = rows[0];
			if (!work || work.locked) {
				return { ok: false, message: "This work isn't open to you." };
			}
			if (work.score !== null) {
				return {
					ok: false,
					message: "This work has been marked. Ask your tutor to reopen it.",
				};
			}
			const key = `${folder(data.id)}${randomUUID()}/${keyName(data.name)}`;
			return {
				ok: true,
				data: { ...(await signUpload(key, data.type)), key },
			};
		} catch (e) {
			return refusal(e);
		}
	});

export const finishSubmission = createServerFn({ method: "POST" })
	.validator((d: unknown) => ({
		...uploadRequest(d),
		key: String((d as { key?: unknown })?.key ?? ""),
	}))
	.handler(async ({ data }): Promise<Outcome> => {
		if (!data.id || !data.key.startsWith(folder(data.id))) {
			return { ok: false, message: "That upload doesn't belong here." };
		}
		try {
			const student = await signedIn();
			const size = await storedSize(data.key);
			if (!size) {
				return { ok: false, message: "The file didn't arrive. Try again." };
			}
			await withStaff(student.auth_id, (db) =>
				sql`select public.my_submit_file(${data.id}::uuid, ${data.name}, ${data.key},
					${size}, ${data.type})`.execute(db),
			);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

export const removeSubmission = createServerFn({ method: "POST" })
	.validator((id: unknown) => uuid(id))
	.handler(async ({ data: id }): Promise<Outcome> => {
		try {
			const student = await signedIn();
			const { rows } = await withStaff(student.auth_id, (db) =>
				sql<{
					key: string;
				}>`select public.my_remove_file(${id}::uuid) as key`.execute(db),
			);
			if (rows[0]?.key) await removeStored([rows[0].key]);
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});

/* The student swaps the password the admin gave them for their own. Neon
   Auth checks the current one and signs their other devices out. */
export const changeMyPassword = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return { current: String(o.current ?? ""), next: String(o.next ?? "") };
	})
	.handler(async ({ data }): Promise<Outcome> => {
		if (data.next.length < 10) {
			return {
				ok: false,
				message: "Use at least 10 characters for the new password.",
			};
		}
		if (data.next === data.current) {
			return { ok: false, message: "Choose a different password." };
		}
		try {
			await signedIn();
			const { error } = await neonAuth().changePassword({
				currentPassword: data.current,
				newPassword: data.next,
				revokeOtherSessions: true,
			});
			if (error) {
				if (error.status === 400 || error.status === 401) {
					return {
						ok: false,
						message: "That isn't your current password.",
					};
				}
				console.error("password change failed:", error.status, error.message);
				return {
					ok: false,
					message: "Could not change the password. Try again shortly.",
				};
			}
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});
