import { cookies } from "next/headers";
import { getIronSession, IronSession, SessionOptions } from "iron-session";
import { DateTime } from "luxon";
import { Resource } from "sst";
import { ISessionStore } from "../../core/interfaces/gateways/session-store.gateway";
import { Session } from "../../core/models/session";

/**
 * Session data structure stored in iron-session cookie
 */
interface IronSessionData {
	userId?: string;
	accessToken?: string;
	createdAt?: string; // ISO string for serialization
}

/**
 * Iron Session implementation of ISessionStore
 *
 * Stores session data in encrypted HTTP-only cookies using iron-session.
 * Each user's browser gets their own encrypted cookie, ensuring complete isolation.
 */
export class IronSessionStore implements ISessionStore {
	private readonly sessionOptions: SessionOptions;

	constructor(config?: { password?: string; cookieName?: string }) {
		const password = config?.password || Resource.SESSION_SECRET.value;

		if (!password) {
			throw new Error("SESSION_SECRET is required");
		}

		this.sessionOptions = {
			password,
			cookieName: config?.cookieName || "hfapp_session",
			cookieOptions: {
				secure: true,
				httpOnly: true,
				sameSite: "lax",
				maxAge: 60 * 60 * 24 * 7, // 7 days
			},
		};
	}

	/**
	 * Get the iron-session instance for the current request
	 */
	private async getIronSessionInstance(): Promise<
		IronSession<IronSessionData>
	> {
		const cookieStore = await cookies();
		return getIronSession<IronSessionData>(
			cookieStore,
			this.sessionOptions
		);
	}

	async getSession(): Promise<Session | null> {
		const session = await this.getIronSessionInstance();

		if (!session.userId || !session.accessToken) {
			return null;
		}

		return {
			userId: session.userId,
			accessToken: session.accessToken,
			createdAt: session.createdAt
				? DateTime.fromISO(session.createdAt).toJSDate()
				: DateTime.now().toJSDate(),
		};
	}

	async setSession(sessionData: Session): Promise<void> {
		const session = await this.getIronSessionInstance();

		session.userId = sessionData.userId;
		session.accessToken = sessionData.accessToken;
		session.createdAt = DateTime.fromJSDate(
			sessionData.createdAt
		).toISO() || undefined;

		await session.save();
	}

	async clearSession(): Promise<void> {
		const session = await this.getIronSessionInstance();
		session.destroy();
		await session.save();
	}
}
