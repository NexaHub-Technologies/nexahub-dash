import { createHash, randomBytes } from "node:crypto";
import postgres from "postgres";

/* Neon Auth stores only a hash of each magic-link token (SHA-256, base64url,
   as Better Auth's defaultKeyHasher), so the link can't be read back. Instead,
   once the app has really asked Neon for a link, the test swaps the stored
   hash for the hash of a token it knows and builds the link Neon would have
   emailed. Issuing, verifying and the callback are all real; only the email
   is skipped. Runs as the owner (DATABASE_OWNER_URL) of the
   branch the tests use. */
const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });

const hash = (token: string) =>
	createHash("sha256").update(token).digest("base64url");

export async function signInLink(to: string, app: string): Promise<string> {
	for (let i = 0; i < 40; i++) {
		const [row] = await sql<{ id: string; identifier: string }[]>`
			select id, identifier from neon_auth.verification
			where identifier like 'magic-link:%'
			  and (case when left(value, 1) = '{' then value::jsonb ->> 'email' end) = ${to.toLowerCase()}
			  and "expiresAt" > now()
			order by "createdAt" desc limit 1`;
		if (row) {
			const token = randomBytes(24).toString("base64url");
			const prefix = row.identifier.slice(0, row.identifier.lastIndexOf(":") + 1);
			await sql`update neon_auth.verification
				set identifier = ${prefix + hash(token)} where id = ${row.id}`;
			const link = new URL(`${process.env.NEON_AUTH_BASE_URL}/magic-link/verify`);
			link.searchParams.set("token", token);
			link.searchParams.set("callbackURL", new URL("/auth/callback", app).href);
			link.searchParams.set("errorCallbackURL", new URL("/login?error=expired", app).href);
			return link.href;
		}
		await new Promise((r) => setTimeout(r, 250));
	}
	throw new Error(`no sign-in link was issued for ${to}`);
}

export async function forgetSignInLinks() {
	await sql`delete from neon_auth.verification where identifier like 'magic-link:%'`;
}
