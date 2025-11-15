/**
 * Session entity representing authenticated user session data
 */
export interface Session {
	/**
	 * HackForums user ID (maps to User.id)
	 */
	userId: string;

	/**
	 * HackForums OAuth access token
	 */
	accessToken: string;

	/**
	 * When the session was created
	 */
	createdAt: Date;
}
