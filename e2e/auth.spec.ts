import { expect, test } from "./fixtures";
import { ADMIN, openNav, signInAs } from "./session";
import { forgetSignInLinks, signInLink } from "./sign-in-link";

test.beforeEach(async () => {
	await forgetSignInLinks();
});

test("signed-out visitors are sent to the login page", async ({ page }) => {
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
});

test("staff sign in with an emailed link and land on the overview", async ({
	page,
	baseURL,
}) => {
	await signInAs(page, baseURL ?? "", ADMIN);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Good to see you, Admin.",
	);
	await expect(page.getByText("New applications")).toBeVisible();

	await openNav(page);
	await page.getByRole("button", { name: "Sign out" }).click();
	await expect(page).toHaveURL(/\/login$/);
	await page.goto("/");
	await expect(page).toHaveURL(/\/login$/);
});

test("someone who isn't staff is told the same thing and is sent no link", async ({
	page,
	baseURL,
}) => {
	await page.goto("/login");
	await page.getByLabel("Work email").fill("stranger@example.com");
	await page.getByRole("button", { name: "Email me a sign-in link" }).click();
	await expect(page.getByText("a sign-in link is on its way")).toBeVisible();
	await expect(
		signInLink("stranger@example.com", baseURL ?? ""),
	).rejects.toThrow();
});
