import { defineConfig, devices } from "@playwright/test";

/* End-to-end tests run a dev server on :3030 against a Neon branch (its
   DATABASE_URL and NEON_AUTH_BASE_URL in .env), signing in with real Neon
   Auth as the admin bootstrap-admin.ts made (E2E_ADMIN_EMAIL and
   E2E_ADMIN_PASSWORD). */
// the same .env the dev server reads (CI writes one per run)
try {
	process.loadEnvFile(".env");
} catch {}

export default defineConfig({
	testDir: "./e2e",
	/* one at a time: the tests share the admin, and Neon Auth rate-limits
	   sign-ins from one address */
	fullyParallel: false,
	workers: 1,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? "github" : "list",
	use: {
		baseURL: "http://localhost:3030",
		trace: "on-first-retry",
	},
	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"], channel: "chrome" } },
		{ name: "mobile", use: { ...devices["Pixel 7"], channel: "chrome" } },
	],
	webServer: {
		command: "bun run dev",
		url: "http://localhost:3030/login",
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
	},
});
