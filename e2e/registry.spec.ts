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

test.describe.configure({ timeout: 180_000 });

/* From application to active student, through the console as the admin
   would do it. Each project (desktop, mobile) gets its own applicants, made
   as the website makes them, and cleaned up afterwards. Owner-only, on the
   branch the tests use. */
const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });
const COURSE = "e2e-registry-course";

const people = (project: string) => ({
	approve: { name: `Amaka ${project}`, email: `amaka.${project}@tests.invalid` },
	decline: { name: `Dapo ${project}`, email: `dapo.${project}@tests.invalid` },
});

async function cleanUp(emails: string[]) {
	await sql`delete from public.payments p using public.invoices i, public.enrolments e, public.students s
		where p.invoice_id = i.id and i.enrolment_id = e.id and e.student_id = s.id and s.email = any(${emails})`;
	await sql`delete from public.invoices i using public.enrolments e, public.students s
		where i.enrolment_id = e.id and e.student_id = s.id and s.email = any(${emails})`;
	await sql`delete from public.notifications n using public.students s
		where n.student_id = s.id and s.email = any(${emails})`;
	await sql`delete from public.students where email = any(${emails})`;
	await sql`delete from public.applications where email = any(${emails})`;
}

test.beforeEach(async ({}, info) => {
	const p = people(info.project.name);
	await cleanUp([p.approve.email, p.decline.email]);
	await sql`insert into public.courses (slug, title, default_fee_kobo)
		values (${COURSE}, 'E2E Registry Course', 12000000)
		on conflict (slug) do update set default_fee_kobo = excluded.default_fee_kobo`;
	for (const who of [p.approve, p.decline]) {
		await sql`insert into public.applications
			(course_slug, full_name, email, phone, gender, employment, mode,
			 has_experience, has_laptop, heard_from, can_commit, notify_consent, comments)
			values (${COURSE}, ${who.name}, ${who.email}, '+2348030000001', 'Female', 'Student',
				'Online training', false, true, 'Social media', true, true, 'Keen to start soon')`;
	}
});

test.afterAll(async () => {
	await cleanUp([
		...Object.values(people("desktop")).map((p) => p.email),
		...Object.values(people("mobile")).map((p) => p.email),
	]);
	await sql`delete from public.courses c where c.slug = ${COURSE}
		and not exists (select 1 from public.applications a where a.course_slug = c.slug)`;
	await sql.end();
});

test("an application is approved, paid for in part, and the student becomes active", async ({
	page,
}, info) => {
	const { approve } = people(info.project.name);
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await openNav(page);
	await navLink(page, "Applications").click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(
		"Applications",
		{ timeout: 20_000 },
	);

	await page.getByRole("link", { name: new RegExp(approve.name) }).click();
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(approve.name, {
		timeout: 20_000,
	});
	await expect(page.getByText("Keen to start soon")).toBeVisible();
	await hydrated(page);

	await page.getByRole("button", { name: "Approve" }).click();
	const dialog = page.getByRole("dialog", { name: `Approve ${approve.name}` });
	await expect(dialog.getByLabel("Fee (₦)")).toHaveValue("120,000");
	await dialog.getByLabel("Fee (₦)").fill("100,000");
	await dialog.getByRole("button", { name: "Approve and enrol" }).click();

	// lands on the new student's registry page, waiting for payment (the
	// application page shows the same name, so wait for the address first)
	await expect(page).toHaveURL(/\/students\//, { timeout: 20_000 });
	await expect(page.getByText("₦100,000 outstanding")).toBeVisible({
		timeout: 20_000,
	});
	await expect(page.getByText("Awaiting payment").first()).toBeVisible();

	await hydrated(page);
	await page.getByRole("button", { name: "Record payment" }).click();
	const pay = page.getByRole("dialog", { name: "Record a payment" });
	await pay.getByLabel("Amount (₦)").fill("40,000");
	await pay.getByLabel("Reference").fill(`TRF-${info.project.name}-1`);
	await pay.getByRole("button", { name: "Record payment" }).click();

	await expect(page.getByText("₦60,000 outstanding")).toBeVisible({ timeout: 20_000 });
	await expect(
		page.getByRole("combobox", { name: "Status on E2E Registry Course" }),
	).toContainText("Active");
	await expect(page.getByText("enrolled as")).toBeVisible();

	// and the registry lists them as active
	await page.goto("/students?status=active");
	await expect(
		page.getByRole("row").filter({ hasText: approve.name }),
	).toContainText("Active", { timeout: 20_000 });
});

test("an application is declined with a reason", async ({ page }, info) => {
	const { decline } = people(info.project.name);
	const [row] = await sql<{ id: string }[]>`
		select id from public.applications where email = ${decline.email}`;
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await page.goto(`/applications/${row?.id}`);
	await hydrated(page);
	await page.getByRole("button", { name: "Decline" }).click();
	const confirm = page.getByRole("alertdialog");
	await confirm.getByLabel("Reason (optional)").fill("Course is full this month");
	await confirm.getByRole("button", { name: "Decline" }).click();
	await expect(page.getByText("Course is full this month")).toBeVisible({
		timeout: 20_000,
	});

	await page.goto("/applications?status=declined");
	await expect(
		page.getByRole("row").filter({ hasText: decline.name }),
	).toContainText("declined", { timeout: 20_000 });
});

test("a student's status and details can be changed, and their record downloaded", async ({
	page,
}, info) => {
	const { approve } = people(info.project.name);
	// approved and part-paid straight in the database, to start from a student
	const [admin] = await sql<{ id: string }[]>`
		select id from public.staff where email = ${ADMIN}`;
	const [app] = await sql<{ id: string }[]>`
		select id from public.applications where email = ${approve.email}`;
	await sql.begin(async (tx) => {
		await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: admin?.id })}, true)`;
		await tx`select public.approve_application(${app?.id}::uuid)`;
	});
	const [student] = await sql<{ id: string }[]>`
		select id from public.students where email = ${approve.email}`;

	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await page.goto(`/students/${student?.id}`);
	await hydrated(page);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(approve.name, {
		timeout: 20_000,
	});

	const status = page.getByRole("combobox", { name: "Status on E2E Registry Course" });
	await status.click();
	await page.getByRole("option", { name: "Paused" }).click();
	await expect(status).toContainText("Paused", { timeout: 20_000 });
	// the change is in the student's status history, attributed to the admin
	await expect(
		page.getByRole("listitem").filter({ hasText: "by Admin" }).last(),
	).toContainText("Paused", { timeout: 20_000 });

	await page.getByRole("button", { name: "Edit" }).click();
	const edit = page.getByRole("dialog", { name: /Edit .*details/ });
	await edit.getByLabel("Address").fill("12 Aminu Kano Crescent, Wuse 2, Abuja");
	await edit.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("12 Aminu Kano Crescent, Wuse 2, Abuja")).toBeVisible({
		timeout: 20_000,
	});

	const response = await page.request.get(`/students/${student?.id}/record.pdf`);
	expect(response.status()).toBe(200);
	expect(response.headers()["content-type"]).toBe("application/pdf");
	expect(response.headers()["content-disposition"]).toContain("registry-record.pdf");
	const body = await response.body();
	expect(body.subarray(0, 5).toString()).toBe("%PDF-");
	expect(body.length).toBeGreaterThan(2_000);
});

test("signed out, a student's record can't be downloaded", async ({ request }) => {
	const response = await request.get(
		"/students/00000000-0000-0000-0000-000000000000/record.pdf",
	);
	expect(response.status()).toBe(404);
});
