/* How the console writes numbers, money and times. Money is stored in kobo;
   times are shown in Lagos time (WAT, UTC+1), whatever the viewer's device. */

const count = new Intl.NumberFormat("en-NG");
const naira = new Intl.NumberFormat("en-NG", {
	style: "currency",
	currency: "NGN",
	maximumFractionDigits: 0,
});
const clock = new Intl.DateTimeFormat("en-NG", {
	timeZone: "Africa/Lagos",
	hour: "numeric",
	minute: "2-digit",
	hour12: true,
});
const day = new Intl.DateTimeFormat("en-NG", {
	timeZone: "Africa/Lagos",
	day: "numeric",
	month: "short",
});

const date = new Intl.DateTimeFormat("en-NG", {
	timeZone: "Africa/Lagos",
	day: "numeric",
	month: "short",
	year: "numeric",
});

export const formatCount = (n: number) => count.format(n);

/* a calendar date ("2026-11-09") or a timestamp, as "9 Nov 2026" */
export const formatDate = (d: string) =>
	date.format(new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? `${d}T12:00:00Z` : d));

/* what someone types into a naira box ("75,000", "₦75000.50") as kobo;
   null when it isn't an amount */
export function parseNaira(input: string): number | null {
	const cleaned = input.replace(/[₦,\s]/g, "");
	if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
	return Math.round(Number(cleaned) * 100);
}
export const formatNaira = (kobo: number) => naira.format(kobo / 100);
export const formatClock = (iso: string) => clock.format(new Date(iso));

/* "just now", "12 min ago", "3 hrs ago", "Yesterday", then a date */
export function timeAgo(iso: string, now = Date.now()) {
	const minutes = Math.round((now - new Date(iso).getTime()) / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes} min ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hr${hours === 1 ? "" : "s"} ago`;
	if (hours < 48) return "Yesterday";
	return day.format(new Date(iso));
}
