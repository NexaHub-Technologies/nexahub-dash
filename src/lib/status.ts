import type { EnrolmentStatus } from "./db.types";

/* A student's status on a course, as the registry shows it. The order is the
   order of a student's journey, which is also the order of the tabs. */
export const STATUSES: readonly EnrolmentStatus[] = [
	"awaiting_payment",
	"active",
	"paused",
	"completed",
	"withdrawn",
];

export const STATUS_LABEL: Record<EnrolmentStatus, string> = {
	awaiting_payment: "Awaiting payment",
	active: "Active",
	paused: "Paused",
	completed: "Completed",
	withdrawn: "Withdrawn",
};

/* the tone each status is drawn in (see the tone tokens in styles.css) */
export const STATUS_TONE: Record<
	EnrolmentStatus,
	"warning" | "success" | "info" | "neutral" | "danger"
> = {
	awaiting_payment: "warning",
	active: "success",
	paused: "info",
	completed: "neutral",
	withdrawn: "danger",
};

export const isStatus = (v: unknown): v is EnrolmentStatus =>
	typeof v === "string" && (STATUSES as readonly string[]).includes(v);

export type { EnrolmentStatus };
