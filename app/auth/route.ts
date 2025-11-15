import { NextRequest, NextResponse } from "next/server";
import { container } from "@/src/container";
import { decodeAuthState } from "@/src/lib/auth-utils";
import { HFService } from "@/src/infrastructure/services/hf-service";

/**
 * OAuth Callback Handler
 *
 * Handles the redirect from HackForums after user authorization.
 * Exchanges the authorization code for an access token and creates a session.
 *
 * Flow:
 * 1. User authorizes on HackForums
 * 2. HF redirects here: /auth?code=ABC&state=xyz
 * 3. We exchange code for token directly with HF
 * 4. Store token in session
 * 5. Redirect user back to where they were going
 */
export async function GET(request: NextRequest) {
	const searchParams = request.nextUrl.searchParams;
	const code = searchParams.get("code");
	const stateParam = searchParams.get("state");

	// Validate required parameters
	if (!code) {
		return NextResponse.json(
			{ error: "Missing authorization code" },
			{ status: 400 }
		);
	}

	try {
		// Exchange authorization code for access token
		const hfService = new HFService(container.sessionStore);
		await hfService.authorize(code);

		// Decode state to get where user was trying to go
		const returnUrl = stateParam
			? decodeAuthState(stateParam).returnUrl
			: "/";

		// Create redirect response
		const response = NextResponse.redirect(new URL(returnUrl, request.url));

		// Ensure we return the response (which will have cookies set)
		return response;
	} catch (error) {
		console.error("Auth callback error:", error);
		return NextResponse.json(
			{
				error: "Authentication failed",
				details:
					error instanceof Error ? error.message : "Unknown error",
			},
			{ status: 500 }
		);
	}
}
