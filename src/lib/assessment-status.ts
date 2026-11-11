/* Where one student's piece of work stands, as the console and the portal
   both show it. Marked wins over submitted, which wins over the lock: a
   grade given for work handed in on paper still reads as graded. */

export type AssessmentKind = "project" | "exercise";
export type WorkState = "locked" | "open" | "submitted" | "marked";

/* Work is graded in words, lowest first. */
export type Grade = "bad" | "good" | "very_good" | "excellent";
export const GRADES: readonly Grade[] = [
	"bad",
	"good",
	"very_good",
	"excellent",
];

export const GRADE_LABEL: Record<Grade, string> = {
	bad: "Bad",
	good: "Good",
	very_good: "Very good",
	excellent: "Excellent",
};

export const GRADE_TONE: Record<Grade, "danger" | "info" | "success"> = {
	bad: "danger",
	good: "info",
	very_good: "success",
	excellent: "success",
};

export const isGrade = (v: unknown): v is Grade =>
	typeof v === "string" && (GRADES as readonly string[]).includes(v);

export const KIND_LABEL: Record<AssessmentKind, string> = {
	project: "Project",
	exercise: "Exercise",
};

export const isKind = (v: unknown): v is AssessmentKind =>
	v === "project" || v === "exercise";

export function workState(w: {
	locked: boolean;
	submitted: boolean;
	grade: Grade | null;
}): WorkState {
	if (w.grade !== null) return "marked";
	if (w.locked) return "locked";
	return w.submitted ? "submitted" : "open";
}

export const WORK_LABEL: Record<WorkState, string> = {
	locked: "Locked",
	open: "Open",
	submitted: "Submitted",
	marked: "Graded",
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
