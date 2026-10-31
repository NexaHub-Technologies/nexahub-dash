import { describe, expect, it } from "vitest";
import {
	daysBetween,
	dueLabel,
	invoiceState,
	isInvoiceView,
	isMonth,
	monthLabel,
	toCsv,
	whatsappLink,
	whatsappNumber,
} from "./invoice";

const TODAY = "2026-11-10";

describe("invoice", () => {
	it("counts whole days between calendar dates", () => {
		expect(daysBetween(TODAY, "2026-11-17")).toBe(7);
		expect(daysBetween(TODAY, "2026-10-31")).toBe(-10);
		// across the end of the year
		expect(daysBetween("2026-12-31", "2027-01-01")).toBe(1);
	});

	it("tells an invoice's state from its status, balance and due date", () => {
		const open = (due_on: string, balance_kobo = 5_000_00) => ({
			status: "open",
			due_on,
			balance_kobo,
		});
		expect(invoiceState(open("2026-11-09"), TODAY)).toBe("overdue");
		expect(invoiceState(open("2026-11-10"), TODAY)).toBe("due_soon");
		expect(invoiceState(open("2026-11-17"), TODAY)).toBe("due_soon");
		expect(invoiceState(open("2026-11-18"), TODAY)).toBe("open");
		// nothing left to pay is paid, whatever the date
		expect(invoiceState(open("2026-10-01", 0), TODAY)).toBe("paid");
		expect(
			invoiceState(
				{ status: "void", due_on: "2026-10-01", balance_kobo: 1 },
				TODAY,
			),
		).toBe("void");
	});

	it("says when an invoice is due", () => {
		expect(dueLabel(TODAY, TODAY)).toBe("Due today");
		expect(dueLabel("2026-11-11", TODAY)).toBe("Due tomorrow");
		expect(dueLabel("2026-11-13", TODAY)).toBe("Due in 3 days");
		expect(dueLabel("2026-11-09", TODAY)).toBe("1 day overdue");
		expect(dueLabel("2026-10-29", TODAY)).toBe("12 days overdue");
	});

	it("reads Nigerian phone numbers however they are written", () => {
		expect(whatsappNumber("0913 451 3173")).toBe("2349134513173");
		expect(whatsappNumber("+234 803 123 4567")).toBe("2348031234567");
		expect(whatsappNumber("234-803-123-4567")).toBe("2348031234567");
		expect(whatsappNumber("803 123 4567")).toBe("2348031234567");
		expect(whatsappNumber("12345")).toBeNull();
		expect(whatsappNumber("+44 20 7946 0958")).toBeNull();
		expect(whatsappNumber(null)).toBeNull();
	});

	it("builds a WhatsApp link with the message filled in", () => {
		expect(whatsappLink("0803 123 4567", "Hi Ada, ₦5,000 & more")).toBe(
			"https://wa.me/2348031234567?text=Hi%20Ada%2C%20%E2%82%A65%2C000%20%26%20more",
		);
		expect(whatsappLink("", "Hi")).toBeNull();
	});

	it("accepts tabs and months only in their own shapes", () => {
		expect(isInvoiceView("overdue")).toBe(true);
		expect(isInvoiceView("everything")).toBe(false);
		expect(isMonth("2026-11")).toBe(true);
		expect(isMonth("2026-13")).toBe(false);
		expect(isMonth("2026-1")).toBe(false);
		expect(monthLabel("2026-11")).toBe("November 2026");
	});

	it("writes CSV a spreadsheet opens safely", () => {
		expect(
			toCsv([
				["Date", "Student", "Amount"],
				["2026-11-02", 'Ada "Ace" Obi, Jr', 50000],
				["2026-11-03", "=HYPERLINK(1)", null],
			]),
		).toBe(
			'Date,Student,Amount\r\n2026-11-02,"Ada ""Ace"" Obi, Jr",50000\r\n2026-11-03,\'=HYPERLINK(1),\r\n',
		);
	});
});
