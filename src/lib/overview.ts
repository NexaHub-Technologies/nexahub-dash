import { createServerFn } from "@tanstack/react-start";
import { getStaff } from "./auth";
import { withStaff } from "./db.server";

/* Headline numbers for the signed-in person. Each count runs under their
   own row-level security, so an instructor's figures cover only their
   cohorts and the fee and application counts come back empty for them. */
export const getOverview = createServerFn({ method: "GET" }).handler(
	async () => {
		const staff = await getStaff();
		if (!staff) throw new Error("Not signed in");
		return withStaff(staff.id, async (db) => {
			const count = async (
				table: "applications" | "students" | "cohorts",
				onlyNew = false,
			) => {
				let q = db
					.selectFrom(table)
					.select((eb) => eb.fn.countAll<string>().as("n"));
				if (onlyNew) q = q.where("status", "=", "new");
				return Number((await q.executeTakeFirstOrThrow()).n);
			};
			return {
				newApplications: await count("applications", true),
				students: await count("students"),
				cohorts: await count("cohorts"),
			};
		});
	},
);
