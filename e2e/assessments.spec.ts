import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import postgres from "postgres";
import { appOnly, expect, test } from "./fixtures";
import { ADMIN, ADMIN_PASSWORD, hydrated, signInAs } from "./session";

test.describe.configure({ timeout: 240_000 });

/* An assessment from end to end, as the admin and a student each see it:
   the admin types a project into a course's track, attaches a file and
   gives the student a login; the student finds it locked; the admin opens
   it; the student downloads the brief and uploads their work; the admin
   downloads that and marks it; the student sees the mark. Each project
   (desktop, mobile) gets its own student, cleaned up afterwards.
   Owner-only, on the branch the tests use, which needs file storage
   (AWS_* in .env, and scripts/storage-setup.ts run once). */
const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });
const COURSE = "e2e-work-course";

test.skip(
	!process.env.AWS_ENDPOINT_URL_S3,
	"file storage isn't configured for this branch",
);

const student = (project: string) => ({
	name: `Wale Work ${project}`,
	email: `wale.work.${project}@tests.invalid`,
});

async function cleanUp(emails: string[]) {
	await sql`delete from neon_auth."user" where email = any(${emails})`;
	await sql`delete from public.students where email = any(${emails})`;
}

let studentId = "";

test.beforeEach(async ({}, info) => {
	const s = student(info.project.name);
	await cleanUp([s.email]);
	await sql`insert into public.courses (slug, title) values (${COURSE}, 'E2E Work Course')
		on conflict (slug) do nothing`;
	await sql`delete from public.assessments where course_slug = ${COURSE}
		and title like ${`%${info.project.name}`}`;
	const [row] = await sql<{ id: string }[]>`
		insert into public.students (full_name, email) values (${s.name}, ${s.email}) returning id`;
	studentId = row?.id ?? "";
	await sql`insert into public.enrolments (student_id, course_slug, status)
		values (${studentId}, ${COURSE}, 'active')`;
});

test.afterAll(async () => {
	await cleanUp([student("desktop").email, student("mobile").email]);
	await sql`delete from public.assessments where course_slug = ${COURSE}`;
	await sql`delete from public.courses where slug = ${COURSE}`;
	await sql.end();
});

/* clicks a file's link and returns what was downloaded */
async function download(page: Page, name: string) {
	const [file] = await Promise.all([
		page.waitForEvent("download"),
		page.getByRole("link", { name, exact: true }).click(),
	]);
	expect(file.suggestedFilename()).toBe(name);
	return (await readFile(await file.path())).toString();
}

test("a project is set, kept locked, opened, handed in and marked", async ({
	page,
	browser,
	baseURL,
}, info) => {
	const s = student(info.project.name);
	const title = `Build a site ${info.project.name}`;
	await signInAs(page, ADMIN, ADMIN_PASSWORD);

	// the admin types the project into the course's track
	await page.goto("/assessments");
	await hydrated(page);
	await page.getByRole("button", { name: "New assessment" }).click();
	const add = page.getByRole("dialog", { name: "New assessment" });
	await add.getByRole("combobox", { name: "Course" }).click();
	await page.getByRole("option", { name: "E2E Work Course" }).click();
	await add.getByLabel("Title", { exact: true }).fill(title);
	await add.getByLabel("Brief", { exact: true }).fill("Three pages, one stylesheet.");
	await add.getByRole("button", { name: "Add", exact: true }).click();

	// it opens on its own page, assigned to the active student and locked
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(title, {
		timeout: 20_000,
	});
	const assessmentUrl = page.url();
	const row = page.getByRole("row").filter({ hasText: s.name });
	await expect(row).toContainText("Locked");

	// with a file for the student to work from
	await page.getByLabel("Add files").setInputFiles({
		name: "starter notes.txt",
		mimeType: "text/plain",
		buffer: Buffer.from("Start with index.html"),
	});
	await expect(
		page.getByRole("link", { name: "starter notes.txt" }),
	).toBeVisible({ timeout: 30_000 });

	// the admin makes the student's login and is shown the password once
	await page.goto(`/students/${studentId}`);
	await hydrated(page);
	await expect(page.getByRole("row").filter({ hasText: title })).toContainText(
		"Locked",
	);
	await page.getByRole("button", { name: "Create login" }).click();
	const handover = page.getByRole("dialog", {
		name: `Give ${s.name} these details`,
	});
	await expect(handover).toContainText(s.email, { timeout: 20_000 });
	const password = await handover.locator("dd.font-mono").innerText();
	expect(password).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/);
	await handover.getByRole("button", { name: "Done" }).click();
	await expect(page.getByRole("button", { name: "Reset password" })).toBeVisible();

	// the student signs in on their own device and lands in the portal
	const { viewport, userAgent, deviceScaleFactor, isMobile, hasTouch } =
		info.project.use;
	const theirs = await browser.newContext({
		baseURL,
		viewport,
		userAgent,
		deviceScaleFactor,
		isMobile,
		hasTouch,
	});
	const portal = await theirs.newPage();
	await appOnly(portal, baseURL);
	await signInAs(portal, s.email, password);
	await expect(portal).toHaveURL(/\/portal$/);
	await expect(portal.getByRole("heading", { level: 1 })).toHaveText("My work");

	// the project is listed, locked: a title and nothing to open
	const item = portal.getByRole("listitem").filter({ hasText: title });
	await expect(item).toContainText("Locked");
	await expect(item.getByRole("link")).toHaveCount(0);
	const workId = (
		await sql<{ id: string }[]>`
			select g.id from public.assignments g
			join public.assessments a on a.id = g.assessment_id
			where a.title = ${title}`
	)[0]?.id;
	await portal.goto(`/portal/${workId}`);
	await expect(portal.getByText("Three pages")).toHaveCount(0);
	const brief = await sql<{ id: string }[]>`
		select f.id from public.assessment_files f
		join public.assessments a on a.id = f.assessment_id where a.title = ${title}`;
	expect(
		(await portal.request.get(`/files/brief/${brief[0]?.id}?work=${workId}`)).status(),
	).toBe(404);

	// the staff console is closed to a student
	await portal.goto("/assessments");
	await expect(portal).toHaveURL(/\/portal$/);

	// the admin opens it
	await page.goto(assessmentUrl);
	await hydrated(page);
	await page.getByRole("button", { name: "Open for all" }).click();
	await expect(row).toContainText("Open", { timeout: 20_000 });

	// now the student reads the brief, downloads its file and uploads work
	await portal.goto("/portal");
	await hydrated(portal);
	await item.getByRole("link").click();
	await expect(portal.getByRole("heading", { level: 1 })).toHaveText(title, {
		timeout: 20_000,
	});
	await expect(portal.getByText("Three pages, one stylesheet.")).toBeVisible();
	expect(await download(portal, "starter notes.txt")).toBe("Start with index.html");
	await hydrated(portal);
	await portal.getByLabel("Upload").setInputFiles({
		name: "my-site.zip",
		mimeType: "application/zip",
		buffer: Buffer.from("pretend this is a zip"),
	});
	await expect(portal.getByRole("link", { name: "my-site.zip" })).toBeVisible({
		timeout: 30_000,
	});

	// the admin sees it waiting, downloads it and marks it
	await page.reload();
	await hydrated(page);
	await expect(row).toContainText("Submitted");
	await row.getByRole("button", { name: "Mark" }).click();
	const mark = page.getByRole("dialog", { name: s.name });
	expect(await download(page, "my-site.zip")).toBe("pretend this is a zip");
	await mark.getByLabel("Score (out of 100)").fill("85");
	await mark.getByLabel("Feedback").fill("Clean layout. Add alt text.");
	await mark.getByRole("button", { name: "Save" }).click();
	await expect(row).toContainText("85 / 100", { timeout: 20_000 });
	await expect(row).toContainText("Marked");

	// a score above the maximum is refused in the database's own words
	await row.getByRole("button", { name: "Review" }).click();
	await mark.getByLabel("Score (out of 100)").evaluate((el) => {
		el.removeAttribute("max");
	});
	await mark.getByLabel("Score (out of 100)").fill("101");
	await mark.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("The score can't be more than 100")).toBeVisible({
		timeout: 20_000,
	});

	// the student sees the mark, and marked work can't be changed
	await portal.reload();
	await expect(portal.getByText("85 / 100")).toBeVisible({ timeout: 20_000 });
	await expect(portal.getByText("Clean layout. Add alt text.")).toBeVisible();
	await expect(portal.getByLabel("Upload")).toHaveCount(0);
	await theirs.close();
});

test("signed out, coursework files can't be downloaded", async ({ request }) => {
	const res = await request.get(
		"/files/brief/00000000-0000-4000-8000-000000000000",
		{ maxRedirects: 0 },
	);
	expect(res.status()).toBe(404);
});
