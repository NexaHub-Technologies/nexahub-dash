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

/* A course with known numbers, so the test doesn't depend on whatever else
   is on the branch: 3 applicants (2 waiting, 1 approved), 2 active students
   and 1 who completed, enrolled straight into the course. Owner-only, on
   the branch the tests use. */
const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });
const SLUG = "e2e-metrics-course";
const UNSEEN = "e2e-brand-new-course";
const STUDENTS = [
	"e0000000-0000-0000-0000-0000000000a1",
	"e0000000-0000-0000-0000-0000000000a2",
	"e0000000-0000-0000-0000-0000000000a3",
];

const application = (slug: string, name: string, status = "new") => sql`
	insert into public.applications
		(course_slug, full_name, email, phone, gender, employment, mode,
		 has_experience, has_laptop, heard_from, can_commit, notify_consent, status)
	values (${slug}, ${name}, ${`${name.toLowerCase().replace(/\W+/g, ".")}@tests.invalid`},
		'+2348030000001', 'Female', 'Student', 'Online training', false, true,
		'Other', true, true, ${status})`;

async function cleanUp() {
	await sql`delete from public.applications where course_slug in (${SLUG}, ${UNSEEN})`;
	await sql`delete from public.students where id = any(${STUDENTS})`;
	await sql`delete from public.courses where slug in (${SLUG}, ${UNSEEN})`;
}

test.beforeAll(async () => {
	await cleanUp();
	await sql`insert into public.courses (slug, title) values (${SLUG}, 'E2E Metrics Course')`;
	await application(SLUG, "Ada Waiting");
	await application(SLUG, "Bayo Waiting");
	await application(SLUG, "Chi Approved", "approved");
	for (const [i, id] of STUDENTS.entries()) {
		await sql`insert into public.students (id, full_name, email)
			values (${id}, ${`E2E Student ${i + 1}`}, ${`e2e.student${i + 1}@tests.invalid`})`;
		await sql`insert into public.enrolments (student_id, course_slug, status)
			values (${id}, ${SLUG}, ${i < 2 ? "active" : "completed"})`;
	}
});

test.afterAll(async () => {
	await cleanUp();
	await sql.end();
});

test("each course shows its applicants and students", async ({ page }) => {
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await openNav(page);
	await navLink(page, "Courses").click();
	await expect(page).toHaveURL("/courses");
	// the page's data is a round trip to the database, which can be slow
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Courses", {
		timeout: 20_000,
	});

	const row = page.getByRole("row").filter({ hasText: "E2E Metrics Course" });
	const cells = row.getByRole("cell");
	await expect(cells.nth(1)).toHaveText("2 new3");
	await expect(cells.nth(2)).toHaveText("2");

	await row.getByRole("link", { name: "E2E Metrics Course" }).click();
	await expect(page).toHaveURL(`/courses/${SLUG}`);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"E2E Metrics Course",
		{ timeout: 20_000 },
	);
	await expect(page.getByText("2 waiting · 1 approved")).toBeVisible();
	const applicants = page
		.getByRole("listitem")
		.filter({ hasText: "Chi Approved" });
	await expect(applicants).toContainText("approved");
	// the course's students, open enrolments first
	const students = page.getByRole("listitem").filter({ hasText: /E2E Student/ });
	await expect(students).toHaveCount(3);
	await expect(students.first()).toContainText("Active");
	await expect(students.last()).toContainText("Completed");
});

test("a course the website adds appears with its first application", async ({
	page,
}) => {
	await application(UNSEEN, "Dayo First");
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await page.goto("/courses");
	await hydrated(page);
	const row = page.getByRole("row").filter({ hasText: "E2e Brand New Course" });
	await expect(row).toBeVisible({ timeout: 20_000 });
	await expect(row.getByRole("cell").nth(1)).toHaveText("1 new1");
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
