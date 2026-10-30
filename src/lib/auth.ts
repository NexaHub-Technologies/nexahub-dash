import { createServerFn } from "@tanstack/react-start";
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
