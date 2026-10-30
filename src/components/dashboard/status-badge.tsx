import { type EnrolmentStatus, STATUS_LABEL, STATUS_TONE } from "#/lib/status";
import { cn } from "#/lib/utils";

const TONE = {
	warning: "bg-warning-soft text-warning",
	success: "bg-success-soft text-success",
	info: "bg-info-soft text-info",
	neutral: "bg-muted text-muted-foreground",
	danger: "bg-danger-soft text-danger",
} as const;

/* A student's status on a course, as a tinted pill with a dot, after the
   status pills in the DistressNow console. */
export function StatusBadge({
	status,
	className,
}: {
	status: EnrolmentStatus;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
				TONE[STATUS_TONE[status]],
				className,
			)}
		>
			<span aria-hidden className="size-1.5 rounded-full bg-current" />
			{STATUS_LABEL[status]}
		</span>
	);
}
