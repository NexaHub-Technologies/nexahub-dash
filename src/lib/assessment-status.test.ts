import { describe, expect, it } from "vitest";
import { workState } from "./assessment-status";
import { cleanFileName, formatBytes, keyName } from "./files";

describe("workState", () => {
	it("is locked until opened", () => {
		expect(workState({ locked: true, submitted: false, score: null })).toBe(
			"locked",
		);
	});
	it("is open, then submitted once the student uploads", () => {
		expect(workState({ locked: false, submitted: false, score: null })).toBe(
			"open",
		);
		expect(workState({ locked: false, submitted: true, score: null })).toBe(
			"submitted",
		);
	});
	it("is marked whenever there is a score, even a zero or while locked", () => {
		expect(workState({ locked: false, submitted: true, score: 0 })).toBe(
			"marked",
		);
		expect(workState({ locked: true, submitted: false, score: 70 })).toBe(
			"marked",
		);
	});
});

describe("file names", () => {
	it("drops any path and control characters", () => {
		expect(cleanFileName("C:\\Users\\ada\\site.zip")).toBe("site.zip");
		expect(cleanFileName("../../etc/pass\u0000wd")).toBe("passwd");
		expect(cleanFileName("  ")).toBe("file");
	});
	it("keeps the extension when shortening", () => {
		const name = cleanFileName(`${"a".repeat(300)}.docx`);
		expect(name).toHaveLength(200);
		expect(name.endsWith(".docx")).toBe(true);
	});
	it("makes a key part that is plain ASCII", () => {
		expect(keyName("Ọlá's site (final).zip")).toBe("-l-s-site-final-.zip");
		expect(keyName("…")).toBe("-");
	});
	it("writes sizes for people", () => {
		expect(formatBytes(900)).toBe("900 B");
		expect(formatBytes(320 * 1024)).toBe("320 KB");
		expect(formatBytes(1.44 * 1024 * 1024)).toBe("1.4 MB");
	});
});
