import { expect, test } from "./fixtures";
import { ADMIN, forgetPeople, openNav, signInAs, visit } from "./session";
import { forgetSignInLinks } from "./sign-in-link";

/* one address per project, so desktop and mobile runs don't collide */
const invitee = (project: string) => `new-instructor-${project}@nexahub.test`;

/* several round trips to Neon each, and sign-in links are rate-limited */
test.slow();

test.beforeEach(async ({}, info) => {
	await forgetSignInLinks();
	await forgetPeople([invitee(info.project.name)]);
});

test("an admin invites an instructor, changes their role and deactivates them", async ({
	page,
	baseURL,
}, info) => {
	const email = invitee(info.project.name);
	await signInAs(page, baseURL ?? "", ADMIN);
	await openNav(page);
	await page.getByRole("link", { name: "Staff" }).click();
	await expect(page).toHaveURL("/staff");

	await page.getByRole("button", { name: "Invite" }).click();
	const dialog = page.getByRole("dialog", { name: "Invite a member of staff" });
	await dialog.getByLabel("Full name").fill("Ngozi Test");
	await dialog.getByLabel("Work email").fill(email);
	await dialog.getByRole("button", { name: "Send invitation" }).click();
	await expect(page.getByText("Ngozi Test has been invited")).toBeVisible();
	await expect(dialog).toBeHidden();

	const row = page.getByRole("row", { name: /Ngozi Test/ });
	await expect(row.getByText("Active")).toBeVisible();

	// inviting the same address again is refused, in the database's words
	await page.getByRole("button", { name: "Invite" }).click();
	await dialog.getByLabel("Full name").fill("Ngozi Again");
	await dialog.getByLabel("Work email").fill(email);
	await dialog.getByRole("button", { name: "Send invitation" }).click();
	await expect(page.getByText(`${email} is already on staff`)).toBeVisible();
	await dialog.getByRole("button", { name: "Cancel" }).click();

	await row.getByRole("combobox", { name: "Role for Ngozi Test" }).click();
	await page.getByRole("option", { name: "Admin" }).click();
	await expect(page.getByText("Ngozi Test is now an admin")).toBeVisible();

	await row.getByRole("button", { name: "Deactivate" }).click();
	await page
		.getByRole("alertdialog")
		.getByRole("button", { name: "Deactivate" })
		.click();
	await expect(page.getByText("Ngozi Test has been deactivated")).toBeVisible();
	await expect(row.getByText("Deactivated")).toBeVisible();

	await row.getByRole("button", { name: "Reactivate" }).click();
	await expect(row.getByText("Active")).toBeVisible();
});

test("an admin can't take away their own access", async ({ page, baseURL }) => {
	await signInAs(page, baseURL ?? "", ADMIN);
	await visit(page, "/staff");
	const me = page.getByRole("row", { name: /\(you\)/ });
	await expect(me.getByRole("combobox")).toBeDisabled();
	await expect(me.getByRole("button", { name: "Deactivate" })).toHaveCount(0);
});

test("an instructor can't open the staff screen", async ({
	page,
	baseURL,
}, info) => {
	const email = invitee(info.project.name);
	// set up as the admin, then sign in as the new instructor
	await signInAs(page, baseURL ?? "", ADMIN);
	await visit(page, "/staff");
	await page.getByRole("button", { name: "Invite" }).click();
	const dialog = page.getByRole("dialog", { name: "Invite a member of staff" });
	await dialog.getByLabel("Full name").fill("Ngozi Test");
	await dialog.getByLabel("Work email").fill(email);
	await dialog.getByRole("button", { name: "Send invitation" }).click();
	await expect(page.getByText("Ngozi Test has been invited")).toBeVisible();
	await page.context().clearCookies();
	await forgetSignInLinks();

	await signInAs(page, baseURL ?? "", email);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Good to see you, Ngozi.",
	);
	await openNav(page);
	await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
	await page.goto("/staff");
	await expect(page).toHaveURL("/");
});
