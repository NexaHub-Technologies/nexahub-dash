import { BookOpenIcon, LayoutGridIcon, type LucideIcon } from "lucide-react";

/* The console's sections. Each lands here as its build phase does; `admin`
   ones are hidden from instructors, whose routes refuse them too. */
export type NavItem = {
	to: string;
	label: string;
	Icon: LucideIcon;
	admin: boolean;
};

export const MAIN_NAV: NavItem[] = [
	{ to: "/", label: "Dashboard", Icon: LayoutGridIcon, admin: false },
	{ to: "/courses", label: "Courses", Icon: BookOpenIcon, admin: false },
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
