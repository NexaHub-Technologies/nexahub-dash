import type { Page } from "@playwright/test";
import { expect } from "./fixtures";

/* the admin scripts/bootstrap-admin.ts makes on the test branch */
export const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "admin@nexahub.test";
export const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? "";

/* Signs in the way a person does, through the login form. Neon Auth allows
   only a few sign-ins from one address in a short window and the tests make
   many, so "too many attempts" waits the window out and tries again. */
export async function signInAs(page: Page, email: string, password: string) {
	const busy = page.getByText("Too many attempts");
	for (let attempt = 1; ; attempt++) {
		await page.goto("/login");
		await page.getByLabel("Email").fill(email);
		await page.getByLabel("Password").fill(password);
		await page.getByRole("button", { name: "Sign in" }).click();
		// a sign-in is a round trip to Neon Auth, which can be slow
		await expect(
			page.getByRole("alert").or(page.getByRole("heading", { level: 1 })),
		).toBeVisible({ timeout: 20_000 });
		if (!(await busy.isVisible())) break;
		if (attempt === 6) throw new Error(`could not sign in as ${email}: rate-limited`);
		await page.waitForTimeout(15_000);
	}
}

/* Server-rendered pages show their buttons before React wires them up; a
   click in that moment does nothing, so wait for the root's marker. */
export async function hydrated(page: Page) {
	await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/* On a phone the sidebar is a drawer behind the menu button. Just after
   hydration the sidebar may not yet know it is on a phone, and a tap then
   toggles the desktop rail instead, so keep tapping until the drawer shows. */
export async function openNav(page: Page) {
	await hydrated(page);
	const logout = page.getByRole("button", { name: "Logout" });
	if (await logout.isVisible()) return;
	await expect(async () => {
		if (!(await logout.isVisible())) {
			await page.getByRole("button", { name: "Toggle Sidebar" }).click();
		}
		await expect(logout).toBeVisible({ timeout: 1_000 });
	}).toPass({ timeout: 15_000 });
}

/* The sidebar's links, not the same-named cards and panels on the page. */
export function navLink(page: Page, name: string) {
	return page
		.getByRole("navigation", { name: "Sections" })
		.getByRole("link", { name, exact: true });
}
