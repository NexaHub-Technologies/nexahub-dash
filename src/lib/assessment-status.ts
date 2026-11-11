/* Where one student's piece of work stands, as the console and the portal
   both show it. Marked wins over submitted, which wins over the lock: a
   score entered for work handed in on paper still reads as marked. */

export type AssessmentKind = "project" | "exercise";
export type WorkState = "locked" | "open" | "submitted" | "marked";

export const KIND_LABEL: Record<AssessmentKind, string> = {
	project: "Project",
	exercise: "Exercise",
};

export const isKind = (v: unknown): v is AssessmentKind =>
	v === "project" || v === "exercise";

export function workState(w: {
	locked: boolean;
	submitted: boolean;
	score: number | null;
}): WorkState {
	if (w.score !== null) return "marked";
	if (w.locked) return "locked";
	return w.submitted ? "submitted" : "open";
}

export const WORK_LABEL: Record<WorkState, string> = {
	locked: "Locked",
	open: "Open",
	submitted: "Submitted",
	marked: "Marked",
};

export const WORK_TONE: Record<
	WorkState,
	"neutral" | "info" | "warning" | "success"
> = {
	locked: "neutral",
	open: "info",
	submitted: "warning",
	marked: "success",
};

/* "8 / 10" */
export const scoreText = (score: number, max: number) => `${score} / ${max}`;
