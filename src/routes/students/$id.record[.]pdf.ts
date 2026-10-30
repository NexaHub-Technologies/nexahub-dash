import { createFileRoute } from "@tanstack/react-router";
import { getStaff } from "../../lib/auth";
import { withStaff } from "../../lib/db.server";
import { renderStudentRecord } from "../../lib/student-record.pdf";
import { loadStudent } from "../../lib/students";

/* A student's registry record as a PDF download. Admins only: the student
   is read under the admin's own row-level security, as on their page. */
export const Route = createFileRoute("/students/$id/record.pdf")({
	server: {
		handlers: {
			GET: async ({ params }) => {
				const staff = await getStaff();
				if (!staff || staff.role !== "admin") {
					return new Response("Not found", { status: 404 });
				}
				const student = await withStaff(staff.id, (db) =>
					loadStudent(db, params.id),
				);
				if (!student) return new Response("Not found", { status: 404 });

				const pdf = await renderStudentRecord(student);
				const name = student.full_name
					.toLowerCase()
					.replace(/[^a-z0-9]+/g, "-")
					.replace(/^-|-$/g, "");
				return new Response(new Uint8Array(pdf), {
					headers: {
						"Content-Type": "application/pdf",
						"Content-Disposition": `attachment; filename="${name || "student"}-registry-record.pdf"`,
						"Cache-Control": "private, no-store",
					},
				});
			},
		},
	},
});
