/* What a change made from the console returns: the database's own words
   when it refuses (its rules raise readable messages with 42501 / 22023 /
   23514 / 23505), so the screen shows exactly why. */
export type Outcome<T = undefined> =
	| ({ ok: true; note?: string } & (T extends undefined ? object : { data: T }))
	| { ok: false; message: string };

const RULE_CODES = new Set(["42501", "22023", "23514", "23505"]);

export function refusal(e: unknown): { ok: false; message: string } {
	const code = (e as { code?: string }).code;
	if (code && RULE_CODES.has(code)) {
		if (code === "23505") {
			return { ok: false, message: "That would duplicate an existing record." };
		}
		return { ok: false, message: (e as Error).message };
	}
	console.error("change refused:", e);
	return { ok: false, message: "Something went wrong. Try again shortly." };
}
