import { Kysely, sql, type Transaction } from "kysely";
import { PostgresJSDialect } from "kysely-postgres-js";
import postgres from "postgres";
import type { DB } from "./db.types";

/* The only way this app reaches the database. It logs in as dash_app, which
   holds no rights of its own (db/roles.sql): each unit of work runs in a
   transaction that first becomes "authenticated" with the caller's staff id,
   so row-level security decides what they see, exactly as it would for any
   other client. */

let db: Kysely<DB> | undefined;

function connect() {
	if (!db) {
		const url = process.env.DATABASE_URL;
		if (!url) throw new Error("DATABASE_URL is not set");
		db = new Kysely<DB>({
			dialect: new PostgresJSDialect({
				// prepare: false because Neon's pooled endpoint runs PgBouncer in
				// transaction mode, where named prepared statements don't survive
				postgres: postgres(url, { max: 5, prepare: false }),
			}),
		});
	}
	return db;
}

export type Db = Transaction<DB>;

/* Runs `work` as the given member of staff. The id must come from a session
   the server has already verified, never from the request itself. */
export function withStaff<T>(staffId: string, work: (db: Db) => Promise<T>) {
	return connect()
		.transaction()
		.execute(async (tx) => {
			// one statement, so becoming the caller costs a single round trip;
			// set_config('role', ..., true) is set local role
			await sql`select set_config('role', 'authenticated', true), set_config('request.jwt.claims', ${JSON.stringify({ sub: staffId })}, true)`.execute(
				tx,
			);
			return work(tx);
		});
}

/* Runs `work` as nobody in particular: the anon role, before sign-in. */
export function asAnon<T>(work: (db: Db) => Promise<T>) {
	return connect()
		.transaction()
		.execute(async (tx) => {
			await sql`set local role anon`.execute(tx);
			return work(tx);
		});
}
