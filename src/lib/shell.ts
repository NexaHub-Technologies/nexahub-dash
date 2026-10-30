import { createServerFn } from "@tanstack/react-start";
import { getCookie } from "@tanstack/react-start/server";

/* The shell's remembered layout, read on the server so the first paint
   already matches: whether the sidebar is open (the shadcn sidebar's own
   cookie) and whether the overview cards are folded, per scope. */

export const OVERVIEW_COOKIE = "nh_overview";
export type OverviewScope = "home" | "pages";
export type OverviewPrefs = Partial<Record<OverviewScope, boolean>>;

export function parseOverviewPrefs(raw: string | undefined): OverviewPrefs {
	try {
		const v = JSON.parse(decodeURIComponent(raw ?? ""));
		return {
			...(typeof v?.home === "boolean" ? { home: v.home } : {}),
			...(typeof v?.pages === "boolean" ? { pages: v.pages } : {}),
		};
	} catch {
		return {};
	}
}

export const getShellPrefs = createServerFn({ method: "GET" }).handler(
	async () => ({
		sidebarOpen: getCookie("sidebar_state") !== "false",
		overview: parseOverviewPrefs(getCookie(OVERVIEW_COOKIE)),
	}),
);
