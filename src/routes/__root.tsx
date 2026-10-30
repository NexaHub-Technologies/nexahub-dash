import {
	createRootRoute,
	HeadContent,
	Outlet,
	Scripts,
} from "@tanstack/react-router";
import appCss from "../styles.css?url";

export const Route = createRootRoute({
	head: () => ({
		meta: [
			{ charSet: "utf-8" },
			{ name: "viewport", content: "width=device-width, initial-scale=1" },
			{ title: "NexaHub Dash" },
			/* a staff tool: nothing here should be indexed */
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "theme-color", content: "#f6eff4" },
		],
		links: [
			{ rel: "icon", type: "image/svg+xml", href: "/logo-main.svg" },
			{ rel: "icon", type: "image/x-icon", href: "/favicon.ico" },
			{ rel: "stylesheet", href: appCss },
		],
	}),
	component: Outlet,
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en-NG">
			<head>
				<HeadContent />
			</head>
			<body>
				{children}
				<Scripts />
			</body>
		</html>
	);
}
