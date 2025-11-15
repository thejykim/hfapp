import { Resource } from "sst";
import { HFClient } from "../clients/hf-client";
import { ISessionStore } from "@/src/core/interfaces/gateways/session-store.gateway";

export interface AuthorizeResult {
	accessToken: string;
	userId: string;
}

/**
 * HackForums Service
 *
 * High-level service for interacting with HackForums API.
 * Manages OAuth flow, session storage, and provides domain methods.
 */
export class HFService {
	private client: HFClient;
	private sessionStore: ISessionStore;

	constructor(sessionStore: ISessionStore) {
		this.client = new HFClient();
		this.sessionStore = sessionStore;
	}

	/**
	 * Exchange authorization code for access token and store in session
	 * @param code Authorization code from HackForums OAuth callback
	 * @returns User ID and access token
	 */
	async authorize(code: string): Promise<AuthorizeResult> {
		// Exchange code for token via proxy
		const tokenData = await this.client.postForm<{
			access_token: string;
			uid: number;
		}>("/authorize", {
			grant_type: "authorization_code",
			client_id: Resource.HF_CLIENT_ID.value,
			client_secret: Resource.HF_CLIENT_SECRET.value,
			code: code,
		});

		// Store session with access token
		await this.sessionStore.setSession({
			userId: tokenData.uid.toString(),
			accessToken: tokenData.access_token,
			createdAt: new Date(),
		});

		return {
			accessToken: tokenData.access_token,
			userId: tokenData.uid.toString(),
		};
	}

	/**
	 * Get the current user's access token from session
	 * @throws Error if no session exists
	 */
	private async getAccessToken(): Promise<string> {
		const session = await this.sessionStore.getSession();
		if (!session) {
			throw new Error("No active session");
		}
		return session.accessToken;
	}

	// Future domain methods will go here:
	// async getMe() { ... }
	// async getThread(tid: number) { ... }
	// async createPost(tid: number, message: string) { ... }
}
