import { Skeleton } from "#/components/ui/skeleton";

/* Shown in place of a page whose data is still on its way, once the wait
   is long enough to notice (the router's defaultPendingMs), so a click on a
   slow connection visibly does something. */
export function PagePending() {
	return (
		<output aria-busy="true" className="flex flex-col gap-4">
			<span className="sr-only">Loading…</span>
			<Skeleton className="h-9 w-48" />
			<Skeleton className="h-[24rem] rounded-xl" />
		</output>
	);
}
