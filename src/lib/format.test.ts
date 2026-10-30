import { describe, expect, it } from "vitest";
import {
	formatClock,
	formatDate,
	formatNaira,
	parseNaira,
	timeAgo,
} from "./format";

describe("format", () => {
	it("writes kobo as whole naira", () => {
		expect(formatNaira(8_000_000).replace(/\s/g, "")).toBe("₦80,000");
	});

	it("shows times in Lagos, whatever the server's zone", () => {
		// 09:00 UTC is 10:00 in Lagos
		expect(formatClock("2026-11-02T09:00:00Z")).toMatch(/^10:00\s?am$/i);
	});

	it("says how long ago, then falls back to a date", () => {
		const now = Date.parse("2026-11-02T12:00:00Z");
		expect(timeAgo("2026-11-02T11:59:50Z", now)).toBe("just now");
		expect(timeAgo("2026-11-02T11:48:00Z", now)).toBe("12 min ago");
		expect(timeAgo("2026-11-02T11:00:00Z", now)).toBe("1 hr ago");
		expect(timeAgo("2026-11-01T10:00:00Z", now)).toBe("Yesterday");
		expect(timeAgo("2026-10-20T10:00:00Z", now)).toMatch(/20 Oct/);
	});

	it("writes calendar dates without shifting the day", () => {
		expect(formatDate("2026-11-09")).toBe("9 Nov 2026");
	});

	it("reads naira as typed into a form, as kobo", () => {
		expect(parseNaira("75,000")).toBe(7_500_000);
		expect(parseNaira("₦160,000")).toBe(16_000_000);
		expect(parseNaira(" 500.5 ")).toBe(50_050);
		for (const bad of ["", "abc", "-5", "1.234", "12,a00"]) {
			expect(parseNaira(bad)).toBeNull();
		}
	});
});
