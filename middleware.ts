import { NextRequest, NextResponse } from "next/server";
import { Resource } from "sst";
import { container } from "./src/container";
import { encodeAuthState, buildHFAuthUrl } from "./src/lib/auth-utils";

/**
 * Next.js Middleware for Authentication
 *
 * Protects all routes by checking for valid session.
 * Redirects unauthenticated users to HackForums OAuth.
 */
export async function middleware(request: NextRequest) {
	// Skip auth check for the callback route itself
	if (request.nextUrl.pathname === "/auth") {
		return NextResponse.next();
	}

	// Check for existing session
	const session = await container.sessionStore.getSession();

	// If no session, redirect to HackForums OAuth
	if (!session) {
		// Encode current path to return to after auth
		const state = encodeAuthState({
			returnUrl: request.nextUrl.pathname + request.nextUrl.search,
		});

		// Build HackForums OAuth URL
		const hfAuthUrl = buildHFAuthUrl({
			clientId: Resource.HF_CLIENT_ID.value,
			redirectUri: `${request.nextUrl.origin}/auth`,
			state,
		});

		return NextResponse.redirect(hfAuthUrl);
	}

	// Session exists, allow request to proceed
	return NextResponse.next();
}

/**
 * Configure which routes the middleware should run on
 */
export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 * - _next/static (static files)
		 * - _next/image (image optimization files)
		 * - favicon.ico (favicon file)
		 */
		"/((?!_next/static|_next/image|favicon.ico).*)",
	],
	// Use Node.js runtime instead of Edge Runtime to support SST Resource and process.env
	runtime: "nodejs",
};
