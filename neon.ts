import { defineConfig } from "@neon/config/v1";

/* What every branch of the NexaHub Dash project has. Sign-in is Managed
   Better Auth; coursework files (assessment briefs and students' uploads)
   are in the private bucket "coursework"; the worker Function and its
   schedule join in Phase 5. */
export default defineConfig({
	auth: true,
	buckets: {
		coursework: { access: "private" },
		uploads: { access: "private" },
	},
});
