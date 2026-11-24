import { useEffect, useState } from "react";

/* Light or dark, as on the website: the visitor's choice is kept in this
   browser, and until they make one the system's setting is followed.

   THEME_SCRIPT runs in <head> before the page paints (__root.tsx), so a
   dark-mode visitor never sees a flash of the light page. */

export type Theme = "light" | "dark";

const KEY = "theme";

export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem("${KEY}");var d=t==="dark"||(t!=="light"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})();`;

function stored(): Theme | null {
	try {
		const t = localStorage.getItem(KEY);
		return t === "dark" || t === "light" ? t : null;
	} catch {
		return null;
	}
}

function apply(theme: Theme) {
	document.documentElement.classList.toggle("dark", theme === "dark");
}

/* `theme` is null until the page has hydrated: the server can't know it. */
export function useTheme() {
	const [theme, setTheme] = useState<Theme | null>(null);

	useEffect(() => {
		setTheme(
			document.documentElement.classList.contains("dark") ? "dark" : "light",
		);
		const media = window.matchMedia("(prefers-color-scheme: dark)");
		const follow = (e: MediaQueryListEvent) => {
			if (stored()) return;
			const next = e.matches ? "dark" : "light";
			apply(next);
			setTheme(next);
		};
		media.addEventListener("change", follow);
		return () => media.removeEventListener("change", follow);
	}, []);

	const toggle = () => {
		const next: Theme = theme === "dark" ? "light" : "dark";
		apply(next);
		setTheme(next);
		try {
			localStorage.setItem(KEY, next);
		} catch {
			/* storage blocked: the choice lasts until the page is reloaded */
		}
	};

	return { theme, toggle };
}
