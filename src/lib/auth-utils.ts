/**
 * Authentication utility functions for HackForums OAuth flow
 */

/**
 * State parameter structure for OAuth flow
 */
export interface AuthState {
	/** URL to redirect to after successful authentication */
	returnUrl: string;
}

/**
 * Encode auth state for OAuth state parameter
 */
export function encodeAuthState(state: AuthState): string {
	return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/**
 * Decode auth state from OAuth state parameter
 * Returns default state if decoding fails (security: prevent open redirects)
 */
export function decodeAuthState(encoded: string): AuthState {
	try {
		const decoded = JSON.parse(
			Buffer.from(encoded, "base64url").toString()
		);

		// Validate returnUrl is a relative path (prevent open redirect)
		if (
			typeof decoded.returnUrl === "string" &&
			decoded.returnUrl.startsWith("/")
		) {
			return decoded;
		}

		// Invalid format, return safe default
		return { returnUrl: "/" };
	} catch {
		// Decoding failed, return safe default
		return { returnUrl: "/" };
	}
}

/**
 * Build HackForums OAuth authorization URL
 */
export function buildHFAuthUrl(params: {
	clientId: string;
	redirectUri: string;
	state: string;
}): string {
	const url = new URL("https://hackforums.net/api/v2/authorize");
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", params.clientId);
	url.searchParams.set("redirect_uri", params.redirectUri);
	url.searchParams.set("state", params.state);
	return url.toString();
}
