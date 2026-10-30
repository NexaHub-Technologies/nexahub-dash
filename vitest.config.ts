import { defineConfig } from "vitest/config";

/* Unit tests exercise plain TypeScript modules, so they don't load the app's
   Vite plugin stack. Database rules are tested in SQL (db/tests), and
   whole flows in Playwright (e2e/). */
export default defineConfig({
	test: {
		environment: "node",
		include: ["src/**/*.test.ts"],
	},
});
