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

export const formatCount = (n: number) => count.format(n);
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
