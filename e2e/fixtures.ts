import { test as base, expect } from "@playwright/test";

/* Every spec imports `test` from here rather than @playwright/test. It blocks
   requests to anywhere but the app and Neon Auth (where sign-in links
   open) — today that is Google Fonts — so a slow or
   unreachable third party can't hold up the page's load event and time a
   test out. The fallback fonts are fine for what the tests check. */
const NEON_AUTH = new URL(process.env.NEON_AUTH_BASE_URL ?? "http://invalid").origin;

export const test = base.extend({
	page: async ({ page, baseURL }, use) => {
		const origin = new URL(baseURL ?? "http://localhost:3030").origin;
		await page.route(
			(url) => url.origin !== origin && url.origin !== NEON_AUTH,
			(route) => route.abort(),
		);
		await use(page);
	},
});

export { expect };
