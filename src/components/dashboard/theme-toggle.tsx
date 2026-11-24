import { MoonIcon, SunIcon } from "lucide-react";
import { useTheme } from "#/lib/theme";
import { cn } from "#/lib/utils";

/* The light/dark switch, as in the website's header. */
export function ThemeToggle({ className }: { className?: string }) {
	const { theme, toggle } = useTheme();
	const dark = theme === "dark";
	const label = dark ? "Switch to light mode" : "Switch to dark mode";
	return (
		<button
			type="button"
			onClick={toggle}
			className={cn("theme-toggle", className)}
			aria-label={label}
			title={label}
		>
			{dark ? <SunIcon aria-hidden /> : <MoonIcon aria-hidden />}
		</button>
	);
}
