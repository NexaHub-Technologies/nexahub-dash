import {
	BookOpenIcon,
	GraduationCapIcon,
	InboxIcon,
	LayoutGridIcon,
	type LucideIcon,
	ReceiptIcon,
} from "lucide-react";
import { formatCount } from "#/lib/format";
import type { OverviewStats } from "#/lib/overview";

/* The console's sections. Each lands here as its build phase does; `admin`
   ones are hidden from instructors, whose routes refuse them too. */
export type NavItem = {
	to: string;
	label: string;
	Icon: LucideIcon;
	admin: boolean;
	/* a live line under the label, from the overview figures */
	hint?: (s: OverviewStats) => string;
	/* how many things here need attention now, flagged on the tab */
	alert?: (s: OverviewStats) => number;
};

const plural = (n: number, one: string, many = `${one}s`) =>
	`${formatCount(n)} ${n === 1 ? one : many}`;

export const MAIN_NAV: NavItem[] = [
	{
		to: "/",
		label: "Dashboard",
		Icon: LayoutGridIcon,
		admin: false,
		hint: () => "Today at a glance",
	},
	{
		to: "/applications",
		label: "Applications",
		Icon: InboxIcon,
		admin: true,
		hint: (s) =>
			s.newApplications
				? `${formatCount(s.newApplications)} to review`
				: "All reviewed",
		alert: (s) => s.newApplications,
	},
	{
		to: "/students",
		label: "Students",
		Icon: GraduationCapIcon,
		admin: true,
		hint: (s) => `${formatCount(s.students)} active`,
	},
	{
		to: "/fees",
		label: "Fees",
		Icon: ReceiptIcon,
		admin: true,
		hint: (s) =>
			s.overdueInvoices
				? `${plural(s.overdueInvoices, "invoice")} overdue`
				: "Nothing overdue",
		alert: (s) => s.overdueInvoices,
	},
	{
		to: "/courses",
		label: "Courses",
		Icon: BookOpenIcon,
		admin: false,
		hint: (s) => plural(s.courses, "course"),
	},
];

export const OTHER_NAV: NavItem[] = [];

export function isActive(pathname: string, to: string) {
	return to === "/"
		? pathname === "/"
		: pathname === to || pathname.startsWith(`${to}/`);
}

export function currentSection(pathname: string) {
	return (
		[...MAIN_NAV, ...OTHER_NAV].find((n) => isActive(pathname, n.to))?.label ??
		"Dashboard"
	);
}
