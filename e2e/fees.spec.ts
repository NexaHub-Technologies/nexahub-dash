import { readFile } from "node:fs/promises";
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

/* Fees as the admin works them: chasing what is overdue, recording what
   comes in, and adding, changing and voiding invoices. Each project
   (desktop, mobile) gets its own student, with one invoice overdue and one
   due soon, cleaned up afterwards. Owner-only, on the branch the tests use. */
const sql = postgres(process.env.DATABASE_OWNER_URL ?? "", { max: 1 });
const COURSE = "e2e-fees-course";

const student = (project: string) => ({
	name: `Funke Fees ${project}`,
	email: `funke.fees.${project}@tests.invalid`,
});

async function cleanUp(emails: string[]) {
	await sql`delete from public.payments p using public.invoices i, public.enrolments e, public.students s
		where p.invoice_id = i.id and i.enrolment_id = e.id and e.student_id = s.id and s.email = any(${emails})`;
	await sql`delete from public.invoices i using public.enrolments e, public.students s
		where i.enrolment_id = e.id and e.student_id = s.id and s.email = any(${emails})`;
	await sql`delete from public.notifications n using public.students s
		where n.student_id = s.id and s.email = any(${emails})`;
	await sql`delete from public.students where email = any(${emails})`;
}

let studentId = "";

test.beforeEach(async ({}, info) => {
	const s = student(info.project.name);
	await cleanUp([s.email]);
	await sql`insert into public.courses (slug, title) values (${COURSE}, 'E2E Fees Course')
		on conflict (slug) do nothing`;
	const [row] = await sql<{ id: string }[]>`
		insert into public.students (full_name, email, phone)
		values (${s.name}, ${s.email}, '0803 123 4567') returning id`;
	studentId = row?.id ?? "";
	const [e] = await sql<{ id: string }[]>`
		insert into public.enrolments (student_id, course_slug, status)
		values (${studentId}, ${COURSE}, 'awaiting_payment') returning id`;
	await sql`insert into public.invoices (enrolment_id, description, amount_kobo, due_on) values
		(${e?.id ?? ""}, 'Tuition', 5000000, (now() at time zone 'Africa/Lagos')::date - 5),
		(${e?.id ?? ""}, 'Exam fee', 1500000, (now() at time zone 'Africa/Lagos')::date + 3)`;
});

test.afterAll(async () => {
	await cleanUp([student("desktop").email, student("mobile").email]);
	await sql`delete from public.courses where slug = ${COURSE}`;
	await sql.end();
});

test("an overdue invoice is chased, paid from the Fees page, and shows in the month's payments", async ({
	page,
}, info) => {
	const s = student(info.project.name);
	const reference = `TRF-FEES-${info.project.name}-${Date.now()}`;
	await signInAs(page, ADMIN, ADMIN_PASSWORD);

	// the dashboard's overdue queue opens the Overdue tab
	await page
		.getByRole("link", { name: /Overdue invoices/ })
		.first()
		.click();
	await expect(page).toHaveURL(/\/fees\?status=overdue/);
	await hydrated(page);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText("Fees", {
		timeout: 20_000,
	});

	const row = page.getByRole("row").filter({ hasText: s.name });
	await expect(row).toContainText("Tuition");
	await expect(row).toContainText("5 days overdue");
	// the exam fee isn't overdue yet
	await expect(page.getByRole("row").filter({ hasText: "Exam fee" }).filter({ hasText: s.name })).toHaveCount(0);

	// the reminder is ready to send on WhatsApp, to the student's number;
	// window.open is caught rather than leaving for wa.me
	await page.evaluate(() => {
		window.open = (url) => {
			document.documentElement.dataset.opened = String(url);
			return null;
		};
	});
	await row.getByRole("button", { name: `More for Tuition, ${s.name}` }).click();
	await page.getByRole("menuitem", { name: "Remind on WhatsApp" }).click();
	const opened = await page.locator("html").getAttribute("data-opened");
	expect(opened).toContain("https://wa.me/2348031234567?text=");
	expect(decodeURIComponent(opened ?? "")).toContain(
		"₦50,000 is outstanding for Tuition (E2E Fees Course)",
	);

	await row.getByRole("button", { name: "Record payment" }).click();
	const pay = page.getByRole("dialog", { name: "Record a payment" });
	await expect(pay.getByLabel("Amount (₦)")).toHaveValue("50,000");
	await pay.getByLabel("Reference").fill(reference);
	await pay.getByRole("button", { name: "Record payment" }).click();
	await expect(page.getByText(`₦50,000 recorded for ${s.name}`)).toBeVisible({
		timeout: 20_000,
	});
	await expect(row).toHaveCount(0, { timeout: 20_000 });

	// paid in full, and the student started
	await page.getByRole("link", { name: /^Paid/ }).click();
	await expect(
		page.getByRole("row").filter({ hasText: s.name }).filter({ hasText: "Tuition" }),
	).toContainText("Paid", { timeout: 20_000 });
	const [{ status }] = await sql<{ status: string }[]>`
		select e.status::text from public.enrolments e where e.student_id = ${studentId}`;
	expect(status).toBe("active");

	// the month's payments, on screen and as a CSV statement
	await openNav(page);
	await navLink(page, "Fees").click();
	await page.getByRole("link", { name: /Collected this month/ }).click();
	await expect(page).toHaveURL(/\/fees\/payments/);
	await hydrated(page);
	const payment = page.getByRole("row").filter({ hasText: s.name });
	await expect(payment).toContainText("₦50,000", { timeout: 20_000 });

	const [download] = await Promise.all([
		page.waitForEvent("download"),
		page.getByRole("button", { name: /Download .* as CSV/ }).click(),
	]);
	expect(download.suggestedFilename()).toMatch(/^nexahub-payments-\d{4}-\d{2}\.csv$/);
	const csv = await readFile(await download.path(), "utf8");
	expect(csv).toContain("Paid on,Student,Course,Invoice,Method,Reference,Amount (NGN),Recorded by");
	expect(csv).toContain(`${s.name},E2E Fees Course,Tuition,transfer,${reference},50000.00`);
});

test("invoices are added, changed and voided from a student's page", async ({
	page,
}, info) => {
	const s = student(info.project.name);
	await signInAs(page, ADMIN, ADMIN_PASSWORD);
	await page.goto(`/students/${studentId}`);
	await hydrated(page);
	await expect(page.getByRole("heading", { level: 1 })).toHaveText(s.name, {
		timeout: 20_000,
	});

	await page.getByRole("button", { name: "Add invoice" }).click();
	const add = page.getByRole("dialog", { name: "Add an invoice" });
	await add.getByLabel("For").fill("Second instalment");
	await add.getByLabel("Amount (₦)").fill("25,000");
	await add.getByRole("button", { name: "Add invoice" }).click();
	await expect(page.getByText("Invoice for ₦25,000 added")).toBeVisible({
		timeout: 20_000,
	});
	const instalment = page.getByRole("row").filter({ hasText: "Second instalment" });
	await expect(instalment).toContainText("₦25,000", { timeout: 20_000 });

	await instalment.getByRole("button", { name: /^More for Second instalment/ }).click();
	await page.getByRole("menuitem", { name: "Change invoice" }).click();
	const change = page.getByRole("dialog", { name: "Change invoice" });
	await change.getByLabel("Amount (₦)").fill("30,000");
	await change.getByRole("button", { name: "Save" }).click();
	await expect(page.getByText("Invoice updated")).toBeVisible({ timeout: 20_000 });
	await expect(instalment).toContainText("₦30,000", { timeout: 20_000 });

	await instalment.getByRole("button", { name: /^More for Second instalment/ }).click();
	await page.getByRole("menuitem", { name: "Void invoice" }).click();
	await page
		.getByRole("alertdialog", { name: "Void this invoice?" })
		.getByRole("button", { name: "Void invoice" })
		.click();
	await expect(page.getByText("Invoice voided")).toBeVisible({ timeout: 20_000 });
	await expect(instalment).toContainText("voided", { timeout: 20_000 });
	await expect(instalment.getByRole("button", { name: "Record payment" })).toHaveCount(0);

	// once part-paid, an invoice can be changed but no longer voided
	const [tuition] = await sql<{ id: string }[]>`
		select i.id from public.invoices i join public.enrolments e on e.id = i.enrolment_id
		where e.student_id = ${studentId} and i.description = 'Tuition'`;
	const [admin] = await sql<{ id: string }[]>`select id from public.staff where email = ${ADMIN}`;
	await sql`insert into public.payments (invoice_id, amount_kobo, method, reference, recorded_by)
		values (${tuition?.id ?? ""}, 1000000, 'cash', ${`CASH-FEES-${info.project.name}-${Date.now()}`}, ${admin?.id ?? ""})`;
	await page.reload();
	await hydrated(page);
	const paidRow = page.getByRole("row").filter({ hasText: "Tuition" });
	await paidRow.getByRole("button", { name: /^More for Tuition/ }).click();
	await expect(page.getByRole("menuitem", { name: "Change invoice" })).toBeVisible();
	await expect(page.getByRole("menuitem", { name: "Void invoice" })).toHaveCount(0);
	await page.keyboard.press("Escape");

	// and the database refuses an amount below what was paid
	await paidRow.getByRole("button", { name: /^More for Tuition/ }).click();
	await page.getByRole("menuitem", { name: "Change invoice" }).click();
	const cut = page.getByRole("dialog", { name: "Change invoice" });
	await cut.getByLabel("Amount (₦)").fill("5,000");
	await cut.getByRole("button", { name: "Save" }).click();
	await expect(
		page.getByText("The amount can't be less than the NGN 10,000 already paid"),
	).toBeVisible({ timeout: 20_000 });
});
