import { expect, test } from "./fixtures";
import { ADMIN, ADMIN_PASSWORD, openNav, signInAs } from "./session";

test.describe.configure({ timeout: 120_000 });

test("signed-out visitors are sent to the login page", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
});

test("the admin signs in with a password, lands on the overview and signs out", async ({
	page,
}) => {
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await expect(page).toHaveURL("/");
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Dashboard");
	await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
	await expect(page.getByText("New applications").first()).toBeVisible();

	await openNav(page);
	await page.getByRole("button", { name: "Logout" }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
});

test("a wrong password is refused and the email is kept", async ({ page }) => {
	await signInAs(page, ADMIN, "not-the-password-123");
	await expect(page).toHaveURL(/\/login\?/);
	await expect(page.getByRole("alert")).toHaveText(
		"That email and password don't match.",
	);
	await expect(page.getByLabel("Email")).toHaveValue(ADMIN);
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
});

test("an unknown email gets the same answer as a wrong password", async ({
	page,
}) => {
	await signInAs(page, "stranger@example.com", "whatever-it-is-123");
	await expect(page.getByRole("alert")).toHaveText(
		"That email and password don't match.",
	);
});
