import { createFileRoute } from "@tanstack/react-router";
import { getStaff } from "../../lib/auth";
import { withStaff } from "../../lib/db.server";
import { loadPayments, thisMonth } from "../../lib/fees";
import { isMonth, toCsv } from "../../lib/invoice";

/* A month's payments as a CSV statement, for a spreadsheet or the
   accountant. Admins only: payments are read under the admin's own
   row-level security, as on the payments page. Amounts are naira. */
export const Route = createFileRoute("/fees/payments.csv")({
	server: {
		handlers: {
			GET: async ({ request }) => {
				const staff = await getStaff();
				if (!staff || staff.role !== "admin") {
					return new Response("Not found", { status: 404 });
				}
				const asked = new URL(request.url).searchParams.get("month");
				const month = isMonth(asked) ? asked : thisMonth();
				const rows = await withStaff(staff.id, (db) => loadPayments(db, month));

				const lagosDate = new Intl.DateTimeFormat("en-CA", {
					timeZone: "Africa/Lagos",
				});
				const csv = toCsv([
					[
						"Paid on",
						"Student",
						"Course",
						"Invoice",
						"Method",
						"Reference",
						"Amount (NGN)",
						"Recorded by",
					],
					...rows.map((p) => [
						lagosDate.format(new Date(p.paid_at)),
						p.full_name,
						p.course,
						p.invoice,
						p.method,
						p.reference,
						(p.amount_kobo / 100).toFixed(2),
						p.recorded_by ?? "",
					]),
				]);
				// the byte-order mark tells Excel the file is UTF-8
				return new Response(`\uFEFF${csv}`, {
					headers: {
						"Content-Type": "text/csv; charset=utf-8",
						"Content-Disposition": `attachment; filename="nexahub-payments-${month}.csv"`,
						"Cache-Control": "private, no-store",
					},
				});
			},
		},
	},
});
