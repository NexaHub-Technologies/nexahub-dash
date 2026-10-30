/* Makes an admin on a Neon branch that has none yet: creates the Neon Auth
   user through the Neon API, then the matching staff row as the owner. Safe
   to run twice. Every later member of staff is invited from the dashboard.

     bun scripts/bootstrap-admin.ts <email> <full name>

   Needs NEON_API_KEY, NEON_PROJECT_ID, NEON_BRANCH_ID and DATABASE_OWNER_URL. */
import postgres from "postgres";

const [email, ...nameParts] = process.argv.slice(2);
const name = nameParts.join(" ");
if (!email || !name) throw new Error("usage: bootstrap-admin.ts <email> <full name>");

const env = (key: string) => {
	const value = process.env[key];
	if (!value) throw new Error(`${key} is not set`);
	return value;
};

const res = await fetch(
	`https://console.neon.tech/api/v2/projects/${env("NEON_PROJECT_ID")}/branches/${env("NEON_BRANCH_ID")}/auth/users`,
	{
		method: "POST",
		headers: {
			Authorization: `Bearer ${env("NEON_API_KEY")}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ email, name }),
	},
);
// 409: the user already exists, which is fine
if (!res.ok && res.status !== 409) {
	throw new Error(`creating the auth user failed: ${res.status} ${await res.text()}`);
}

const sql = postgres(env("DATABASE_OWNER_URL"), { max: 1 });
try {
	const [user] = await sql<{ id: string }[]>`
		select id from neon_auth."user" where lower(email) = lower(${email})`;
	if (!user) throw new Error(`no neon_auth user for ${email} after creating it`);
	await sql`
		insert into public.staff (id, full_name, email, role)
		values (${user.id}, ${name}, ${email.toLowerCase()}, 'admin')
		on conflict (id) do update set role = 'admin', active = true`;
	console.log(`${email} is an admin`);
} finally {
	await sql.end();
}
