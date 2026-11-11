import { test as base, expect, type Page } from "@playwright/test";

/* Blocks requests to anywhere but the app itself and its file storage —
   today that leaves out Google Fonts — so a slow or unreachable third party
   can't hold up the page's load event and time a test out. The fallback
   fonts are fine for what the tests check. Uploads and downloads go
   straight between the browser and storage, so that origin stays open. */
export async function appOnly(page: Page, baseURL: string | undefined) {
	const allowed = new Set([new URL(baseURL ?? "http://localhost:3030").origin]);
	if (process.env.AWS_ENDPOINT_URL_S3) {
		allowed.add(new URL(process.env.AWS_ENDPOINT_URL_S3).origin);
	}
	await page.route(
		(url) => !allowed.has(url.origin),
		(route) => route.abort(),
	);
}

/* Every spec imports `test` from here rather than @playwright/test, so its
   page is already limited to the app. */
export const test = base.extend({
	page: async ({ page, baseURL }, use) => {
		await appOnly(page, baseURL);
		await use(page);
	},
});

export { expect };
