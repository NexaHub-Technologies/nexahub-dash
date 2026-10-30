import { sql } from "kysely";
import { asAnon } from "./db.server";
import { neonAuth } from "./neon-auth.server";

const EMAIL = /^[^@\s]+@[^@\s.]+\.[^@\s]+$/;

export type LinkResult = "sent" | "invalid" | "failed";

/* Emails a sign-in link to active staff, and to nobody else; the result is
   "sent" either way, so the form does not reveal who works here. Server-only:
   called from the /auth/link route. */
export async function requestLoginLink(
	raw: unknown,
	origin: string,
): Promise<LinkResult> {
	if (typeof raw !== "string" || !EMAIL.test(raw.trim())) return "invalid";
	const email = raw.trim().toLowerCase();
	const allowed = await asAnon(async (db) => {
		const { rows } = await sql<{
			ok: boolean;
		}>`select public.can_sign_in(${email}) as ok`.execute(db);
		return rows[0]?.ok === true;
	});
	if (!allowed) return "sent";
	const { error } = await neonAuth().signIn.magicLink({
		email,
		callbackURL: `${origin}/auth/callback`,
		// an expired or reused link comes back here instead of to the overview
		errorCallbackURL: `${origin}/login?error=expired`,
	});
	if (error) {
		console.error(
			"sign-in link failed:",
			error.status,
			error.code,
			error.message,
		);
		return "failed";
	}
	return "sent";
}
