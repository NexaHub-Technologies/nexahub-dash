import {
	createAuthServer,
	extractNeonAuthCookies,
	resolveNeonAuthLogging,
} from "@neondatabase/auth/server";
import {
	getRequestHeader,
	getRequestUrl,
	setCookie,
} from "@tanstack/react-start/server";

/* Neon's Managed Better Auth, bridged to TanStack Start with the toolkit
   @neondatabase/auth/server provides for frameworks it has no adapter for.
   Auth runs on Neon's servers and only this app's server talks to it, so the
   session cookies belong to dash.nexahubtech.company. */

function config() {
	const baseUrl = process.env.NEON_AUTH_BASE_URL;
	const cookieSecret = process.env.NEON_AUTH_COOKIE_SECRET;
	if (!baseUrl || !cookieSecret) {
		throw new Error(
			"NEON_AUTH_BASE_URL and NEON_AUTH_COOKIE_SECRET must be set",
		);
	}
	return {
		baseUrl,
		cookieSecret,
		// the signed session cache is re-checked with Neon after a minute; the
		// staff row is read live on every request regardless (see getStaff)
		sessionDataTtl: 60,
		sameSite: "lax" as const,
		log: resolveNeonAuthLogging({}),
	};
}

let server: ReturnType<typeof createAuthServer> | undefined;

/* Better Auth's server methods (getSession, signIn.email, signOut, ...),
   acting for the request in flight. */
export function neonAuth() {
	if (!server) {
		const c = config();
		server = createAuthServer({
			...c,
			context: () => ({
				getCookies: () =>
					extractNeonAuthCookies(getRequestHeader("cookie") ?? ""),
				setCookie: (name, value, options) => setCookie(name, value, options),
				getHeader: (name) => getRequestHeader(name) ?? null,
				getOrigin: () => getRequestHeader("origin") ?? getRequestUrl().origin,
				getFramework: () => "tanstack-start",
			}),
		});
	}
	return server;
}
