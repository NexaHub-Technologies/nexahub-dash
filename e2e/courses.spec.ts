import postgres from "postgres";
import { expect, test } from "./fixtures";
import {
	ADMIN,
	ADMIN_PASSWORD,
	hydrated,
	navLink,
	openNav,
	signInAs,
} from "./session";

test.describe.configure({ timeout: 120_000 });

/* A course of its own, so the test doesn't depend on the website having
   synced to this branch. Owner-only, on the branch the tests use. */
const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });
const SLUG = "e2e-test-course";

test.beforeAll(async () => {
	await sql`insert into public.courses (slug, title, default_fee_kobo)
		values (${SLUG}, 'E2E Test Course', 12500000)
		on conflict (slug) do update set title = excluded.title, default_fee_kobo = excluded.default_fee_kobo`;
	await sql`insert into public.course_modules (course_slug, n, title)
		values (${SLUG}, 1, 'Getting started'), (${SLUG}, 2, 'Going further')
		on conflict do nothing`;
});

test.afterAll(async () => {
	await sql`delete from public.courses where slug = ${SLUG}`;
	await sql.end();
});

test("courses are listed with their fee, and each shows its modules", async ({
	page,
}) => {
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await openNav(page);
	await navLink(page, "Courses").click();
	await expect(page).toHaveURL("/courses");
	// the page's data is a round trip to the database, which can be slow
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Courses", {
		timeout: 20_000,
	});

	const row = page.getByRole("row").filter({ hasText: "E2E Test Course" });
	await expect(row).toContainText("₦125,000");
	await expect(row.getByRole("cell").nth(1)).toHaveText("2");

	await row.getByRole("link", { name: "E2E Test Course" }).click();
	await expect(page).toHaveURL(`/courses/${SLUG}`);
	await expect(
		page.getByRole("listitem").filter({ hasText: "Going further" }),
	).toContainText("02", { timeout: 20_000 });
});

test("the overview folds to one line away from the dashboard, and stays as chosen", async ({
	page,
}) => {
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	const toggle = page.getByRole("button", { name: /^Overview/ });
	await expect(toggle).toHaveAttribute("aria-expanded", "true");

	await page.goto("/courses");
	await hydrated(page);
	await expect(toggle).toHaveAttribute("aria-expanded", "false");
	await expect(toggle).toContainText("courses");

	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-expanded", "true");
	await page.reload();
	await expect(toggle).toHaveAttribute("aria-expanded", "true");
});
