/* Makes the dashboard's admin, or sets a new password for them: the Neon Auth
   user, a password login for it, and an active admin staff row, in one
   transaction. Safe to run again, e.g. to change a forgotten password.

     bun --no-env-file scripts/bootstrap-admin.ts <email> <full name>

   Asks for the password without echoing it, so it never lands in shell
   history or a log. CI passes ADMIN_PASSWORD instead. Runs as the owner
   (DATABASE_OWNER_URL) of whichever branch it should change.

   The password is stored the way Neon Auth (Better Auth) stores one at
   sign-up: a hash from better-auth/crypto in neon_auth.account, under the
   "credential" provider. */
import { createInterface } from "node:readline";
import { hashPassword } from "better-auth/crypto";
import postgres from "postgres";

const [rawEmail, ...nameParts] = process.argv.slice(2);
const email = rawEmail?.trim().toLowerCase();
const name = nameParts.join(" ").trim();
if (!email || !name) {
	throw new Error("usage: bootstrap-admin.ts <email> <full name>");
}
const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL is not set");

/* reads a line from the terminal without showing what is typed */
function askHidden(prompt: string) {
	return new Promise<string>((resolve) => {
		const rl = createInterface({ input: process.stdin, output: process.stdout });
		const write = process.stdout.write.bind(process.stdout);
		rl.question(prompt, (answer) => {
			process.stdout.write = write;
			write("\n");
			rl.close();
			resolve(answer);
		});
		process.stdout.write = (() => true) as typeof process.stdout.write;
	});
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
	if (!process.stdin.isTTY) {
		throw new Error("run this in a terminal, or set ADMIN_PASSWORD");
	}
	password = await askHidden(`New password for ${email}: `);
	if ((await askHidden("Again: ")) !== password) {
		throw new Error("the passwords don't match; nothing was changed");
	}
}
if (password.length < 12) {
	throw new Error("use at least 12 characters; nothing was changed");
}

const hash = await hashPassword(password);
const sql = postgres(url, { max: 1, onnotice: () => {} });
try {
	await sql.begin(async (tx) => {
		const [user] = await tx<{ id: string }[]>`
			insert into neon_auth."user" (name, email, "emailVerified")
			values (${name}, ${email}, true)
			on conflict (email) do update set name = excluded.name, "updatedAt" = now()
			returning id`;
		if (!user) throw new Error(`could not create the auth user for ${email}`);

		const updated = await tx`
			update neon_auth.account set password = ${hash}, "updatedAt" = now()
			where "userId" = ${user.id} and "providerId" = 'credential'`;
		if (updated.count === 0) {
			await tx`
				insert into neon_auth.account ("accountId", "providerId", "userId", password, "updatedAt")
				values (${user.id}, 'credential', ${user.id}, ${hash}, now())`;
		}

		await tx`
			insert into public.staff (id, full_name, email, role)
			values (${user.id}, ${name}, ${email}, 'admin')
			on conflict (id) do update set role = 'admin', active = true`;
	});
	console.log(`${email} is an admin and can sign in with the new password`);
} finally {
	await sql.end();
}
