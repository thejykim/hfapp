import { Session } from "../../models/session";

/**
 * Gateway interface for managing user sessions
 *
 * Implementations should handle session storage (cookies, database, etc.)
 * and ensure proper encryption/security of session data.
 */
export interface ISessionStore {
	/**
	 * Get the current session for the authenticated user
	 * @returns Session data if authenticated, null otherwise
	 */
	getSession(): Promise<Session | null>;

	/**
	 * Set session data for the current user
	 * @param session Session data to store
	 */
	setSession(session: Session): Promise<void>;

	/**
	 * Clear the current user's session (logout)
	 */
	clearSession(): Promise<void>;
}
