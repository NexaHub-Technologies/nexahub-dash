import {
	createAuthServer,
	extractNeonAuthCookies,
	handleAuthProxyRequest,
	resolveNeonAuthLogging,
} from "@neondatabase/auth/server";
import {
	getRequestHeader,
	getRequestUrl,
	setCookie,
} from "@tanstack/react-start/server";

/* Neon's Managed Better Auth, bridged to TanStack Start with the toolkit
   @neondatabase/auth/server provides for frameworks it has no adapter for.
   Auth runs on Neon's servers; everything reaches it through this app, so its
   cookies belong to dash.nexahubtech.company and the server can read them. */

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

/* Better Auth's server methods (getSession, signIn.magicLink, signOut, ...),
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

/* The /api/auth/* pass-through: Neon's answer, with its Set-Cookie, goes
   back to the browser as if this app had made it. */
export function proxyAuth(request: Request, path: string) {
	return handleAuthProxyRequest({ request, path, ...config() });
}

/* The magic link itself opens on Neon, which checks the token and sends the
   browser to /auth/callback with a one-time verifier. Trading that verifier
   for a session (get-session?neon_auth_session_verifier=...) returns the
   session cookies, on this app's own domain. Null if Neon refuses it. */
export async function exchangeVerifier(request: Request, verifier: string) {
	const url = new URL("/api/auth/get-session", request.url);
	url.searchParams.set("neon_auth_session_verifier", verifier);
	const res = await proxyAuth(
		new Request(url, { headers: request.headers }),
		"get-session",
	);
	const cookies = res.headers.getSetCookie();
	return res.ok && cookies.length > 0 ? cookies : null;
}
