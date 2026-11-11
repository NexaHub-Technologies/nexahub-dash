import { createFileRoute } from "@tanstack/react-router";
import { sql } from "kysely";
import { getViewer } from "../../lib/auth";
import { withStaff } from "../../lib/db.server";
import { signDownload } from "../../lib/storage.server";

/* Downloads a coursework file: /files/brief/<id> for one that came with an
   assessment, /files/submission/<id> for one on a student's assignment.
   The database decides who may have it. An admin reads the file's row
   under their own row-level security; a student names the assignment
   (?work=) and gets it only through my_assignment_files, which lists the
   files of their own open work. Then the browser is sent to a link that is
   good for five minutes. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Found = { storage_key: string; name: string; content_type: string };

export const Route = createFileRoute("/files/$source/$id")({
	server: {
		handlers: {
			GET: async ({ params, request }) => {
				const missing = () => new Response("Not found", { status: 404 });
				const brief = params.source === "brief";
				if (
					(!brief && params.source !== "submission") ||
					!UUID.test(params.id)
				) {
					return missing();
				}
				const viewer = await getViewer();
				if (!viewer) return missing();

				let file: Found | undefined;
				if (viewer.staff) {
					file = await withStaff(viewer.staff.id, (db) =>
						db
							.selectFrom(brief ? "assessment_files" : "submission_files")
							.select(["storage_key", "name", "content_type"])
							.where("id", "=", params.id)
							.executeTakeFirst(),
					);
				} else {
					const work = new URL(request.url).searchParams.get("work") ?? "";
					if (!UUID.test(work)) return missing();
					const { rows } = await withStaff(viewer.student.auth_id, (db) =>
						sql<Found>`
							select storage_key, name, content_type
							from public.my_assignment_files(${work}::uuid)
							where id = ${params.id}
								and (source = 'brief') = ${brief}`.execute(db),
					);
					file = rows[0];
				}
				if (!file) return missing();

				return new Response(null, {
					status: 302,
					headers: {
						Location: await signDownload(
							file.storage_key,
							file.name,
							file.content_type,
						),
						"Cache-Control": "private, no-store",
					},
				});
			},
		},
	},
});
