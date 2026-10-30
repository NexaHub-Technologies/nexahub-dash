/* Applies db/migrations/*.sql in name order, each in its own transaction, and
   records it in private.schema_migrations so it never runs twice. Then
   re-applies db/roles.sql, which is idempotent. Runs as the database owner
   (DATABASE_OWNER_URL), against local Docker or any Neon branch alike.

     bun scripts/migrate.ts            apply what's new
     bun scripts/migrate.ts --seed     ...then load db/seed.sql (local only) */
import { readdir, readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.DATABASE_OWNER_URL;
if (!url) throw new Error("DATABASE_OWNER_URL is not set");

const sql = postgres(url, { max: 1, onnotice: () => {} });
const dir = new URL("../db/migrations/", import.meta.url);

try {
	await sql`create schema if not exists private`;
	await sql`create table if not exists private.schema_migrations (
		name text primary key,
		applied_at timestamptz not null default now()
	)`;
	const done = new Set(
		(await sql<{ name: string }[]>`select name from private.schema_migrations`).map(
			(r) => r.name,
		),
	);
	const files = (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort();

	for (const file of files) {
		if (done.has(file)) continue;
		const body = await readFile(new URL(file, dir), "utf8");
		await sql.begin(async (tx) => {
			await tx.unsafe(body);
			await tx`insert into private.schema_migrations (name) values (${file})`;
		});
		console.log(`applied ${file}`);
	}

	await sql.unsafe(
		await readFile(new URL("../db/roles.sql", import.meta.url), "utf8"),
	);
	if (process.argv.includes("--seed")) {
		await sql.unsafe(
			await readFile(new URL("../db/seed.sql", import.meta.url), "utf8"),
		);
		console.log("seeded");
	}
} finally {
	await sql.end();
}
