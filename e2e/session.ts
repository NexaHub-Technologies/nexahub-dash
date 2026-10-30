import type { Page } from "@playwright/test";
import postgres from "postgres";
import { expect } from "./fixtures";
import { signInLink } from "./sign-in-link";

/* needs the admin scripts/bootstrap-admin.ts creates on the test branch */
export const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "admin@nexahub.test";

/* Signs in the way a person does: the login form, then the emailed link.
   Neon Auth allows only a few magic links in a short window and the tests
   ask for many, so a "couldn't send" answer waits out the window and tries
   again, as a person would. */
export async function signInAs(page: Page, app: string, email: string) {
	const sent = page.getByText("a sign-in link is on its way");
	const failed = page.getByText("Could not send a link right now");
	for (let attempt = 1; ; attempt++) {
		await page.goto("/login");
		await page.getByLabel("Work email").fill(email);
		await page.getByRole("button", { name: "Email me a sign-in link" }).click();
		await expect(sent.or(failed)).toBeVisible();
		if (await sent.isVisible()) break;
		if (attempt === 3) throw new Error(`no sign-in link could be sent to ${email}`);
		await page.waitForTimeout(11_000);
	}
	await page.goto(await signInLink(email, app));
	await expect(page).toHaveURL("/");
	await hydrated(page);
}

/* Server-rendered pages show their buttons before React wires them up; a
   click in that moment does nothing, so wait for the root's marker. */
export async function hydrated(page: Page) {
	await page.locator("html[data-hydrated]").waitFor({ state: "attached" });
}

/* Opens a page and waits until it responds to clicks. */
export async function visit(page: Page, path: string) {
	await page.goto(path);
	await hydrated(page);
}

/* On a phone the sidebar is a drawer behind the menu button. */
export async function openNav(page: Page) {
	const signOut = page.getByRole("button", { name: "Sign out" });
	if (!(await signOut.isVisible())) {
		await page.getByRole("button", { name: "Toggle Sidebar" }).click();
	}
}

const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });

/* Removes people a test invited, so a re-run starts clean. Owner-only, on
   the branch the tests use; the audit log keeps its record of them. */
export async function forgetPeople(emails: string[]) {
	await sql`delete from public.staff where email = any(${emails})`;
	await sql`delete from neon_auth."user" where email = any(${emails})`;
}
