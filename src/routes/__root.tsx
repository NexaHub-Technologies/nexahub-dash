import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "#/components/ui/toast";
import { TooltipProvider } from "#/components/ui/tooltip";
import { THEME_SCRIPT } from "#/lib/theme";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "NexaHubTech Dash" },
			/* a staff tool: nothing here should be indexed */
			{ name: "robots", content: "noindex, nofollow" },
			/* one only: the router keeps a single meta per name */
			{ name: "theme-color", content: "#f4eff7" },
		],
		links: [
			{ rel: "icon", type: "image/svg+xml", href: "/logo-main.svg" },
			{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
			{ rel: "stylesheet", href: appCss },
		],
	}),
	component: Root,
	shellComponent: RootDocument,
});

/* Marks the page once React has taken over, so the end-to-end tests can wait
   for buttons to work instead of clicking server-rendered HTML. */
function Root() {
	useEffect(() => {
		document.documentElement.dataset.hydrated = "";
	}, []);
	return <Outlet />;
}

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		// the theme script sets the html's class before React hydrates
		<html lang="en-NG" suppressHydrationWarning>
			<head>
				<HeadContent />
				<script>{THEME_SCRIPT}</script>
			</head>
			<body>
				<TooltipProvider>
					<Toaster>{children}</Toaster>
				</TooltipProvider>
				<Scripts />
			</body>
		</html>
	);
}
