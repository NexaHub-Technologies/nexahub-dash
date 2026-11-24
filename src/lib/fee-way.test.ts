import { describe, expect, it } from "vitest";
import { feeWay } from "./fee-way";

describe("feeWay", () => {
	it("charges the website's in-person modes the in-person fee", () => {
		expect(feeWay("In-home training")).toBe("in person");
		expect(feeWay("Hybrid — online and in-home")).toBe("in person");
		expect(feeWay("In person")).toBe("in person");
	});

	it("charges online, and anything unrecognised, the online fee", () => {
		expect(feeWay("Online training")).toBe("online");
		expect(feeWay("")).toBe("online");
		expect(feeWay("Evenings")).toBe("online");
	});
});
