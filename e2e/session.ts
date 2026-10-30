import type { Page } from "@playwright/test";
import postgres from "postgres";
import { expect } from "./fixtures";
import { signInLink } from "./sign-in-link";

/* needs the admin scripts/bootstrap-admin.ts creates on the test branch */
export const ADMIN = process.env.E2E_ADMIN_EMAIL ?? "admin@nexahub.test";

/* Signs in the way a person does: the login form, then the emailed link. */
export async function signInAs(page: Page, app: string, email: string) {
	await page.goto("/login");
	await page.getByLabel("Work email").fill(email);
	await page.getByRole("button", { name: "Email me a sign-in link" }).click();
	await expect(page.getByText("a sign-in link is on its way")).toBeVisible();
	await page.goto(await signInLink(email, app));
	await expect(page).toHaveURL("/");
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
