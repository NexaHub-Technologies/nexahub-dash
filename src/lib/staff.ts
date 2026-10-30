import { createServerFn } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";
import { sql } from "kysely";
import { getStaff, type Staff } from "./auth";
import { withStaff } from "./db.server";
import { sendSignInLink } from "./login-link.server";

export type Role = Staff["role"];
export type StaffMember = Staff & { active: boolean; created_at: string };

/* What a staff change returns: the database's own words when it refuses
   (its rules raise readable messages with 42501 / 22023 / 23514), so the
   screen shows exactly why. */
export type Outcome =
	| { ok: true; note?: string }
	| { ok: false; message: string };

const RULE_CODES = new Set(["42501", "22023", "23514"]);

async function asAdmin<T>(work: Parameters<typeof withStaff<T>>[1]) {
	const me = await getStaff();
	if (!me) throw new Error("Not signed in");
	return { me, result: await withStaff(me.id, work) };
}

function refusal(e: unknown): Outcome {
	const code = (e as { code?: string }).code;
	if (code && RULE_CODES.has(code)) {
		return { ok: false, message: (e as Error).message };
	}
	console.error("staff change failed:", e);
	return { ok: false, message: "Something went wrong. Try again shortly." };
}

const ROLES: readonly Role[] = ["admin", "instructor"];

/* Everyone on staff, active first. RLS lets any member of staff read the
   team; the screen itself is for admins. */
export const listStaff = createServerFn({ method: "GET" }).handler(async () => {
	const { result } = await asAdmin((db) =>
		db
			.selectFrom("staff")
			.select(["id", "full_name", "email", "role", "active", "created_at"])
			.orderBy("active", "desc")
			.orderBy("full_name")
			.execute(),
	);
	return result.map(
		(s): StaffMember => ({ ...s, created_at: s.created_at.toISOString() }),
	);
});

export const inviteStaff = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			email: String(o.email ?? ""),
			full_name: String(o.full_name ?? ""),
			role: ROLES.includes(o.role as Role) ? (o.role as Role) : "instructor",
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		try {
			await asAdmin((db) =>
				sql`select public.invite_staff(${data.email}, ${data.full_name}, ${data.role}::public.staff_role)`.execute(
					db,
				),
			);
		} catch (e) {
			return refusal(e);
		}
		/* The account exists either way; if the email doesn't go out, they can
		   still ask for a link from the login page. */
		const sent = await sendSignInLink(
			data.email.trim().toLowerCase(),
			getRequestUrl().origin,
		);
		return sent
			? { ok: true }
			: {
					ok: true,
					note: "Invited, but the sign-in email didn't send. They can request one from the login page.",
				};
	});

export const updateStaff = createServerFn({ method: "POST" })
	.validator((d: unknown) => {
		const o = (d ?? {}) as Record<string, unknown>;
		return {
			id: String(o.id ?? ""),
			...(ROLES.includes(o.role as Role) ? { role: o.role as Role } : {}),
			...(typeof o.active === "boolean" ? { active: o.active } : {}),
		};
	})
	.handler(async ({ data }): Promise<Outcome> => {
		const { id, ...changes } = data;
		if (!Object.keys(changes).length)
			return { ok: false, message: "Nothing to change." };
		try {
			const { result } = await asAdmin((db) =>
				db
					.updateTable("staff")
					.set(changes)
					.where("id", "=", id)
					.executeTakeFirst(),
			);
			/* RLS hides the row from anyone who may not change it, so a refused
			   update looks like one that matched nothing */
			if (!result.numUpdatedRows) {
				return { ok: false, message: "Only an admin can change staff." };
			}
			return { ok: true };
		} catch (e) {
			return refusal(e);
		}
	});
