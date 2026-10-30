import { test as base, expect } from "@playwright/test";

/* Every spec imports `test` from here rather than @playwright/test. It blocks
   requests to anywhere but the app itself — today that is Google Fonts —
   so a slow or
   unreachable third party can't hold up the page's load event and time a
   test out. The fallback fonts are fine for what the tests check. */
export const test = base.extend({
	page: async ({ page, baseURL }, use) => {
		const origin = new URL(baseURL ?? "http://localhost:3030").origin;
		await page.route(
			(url) => url.origin !== origin,
			(route) => route.abort(),
		);
		await use(page);
	},
});

export { expect };
