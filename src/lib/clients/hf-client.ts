import { Resource } from "sst";

export interface HFErrorResponse {
	error?: string;
	message?: string;
}

export class HFClientError extends Error {
	constructor(
		message: string,
		public statusCode?: number,
		public response?: unknown
	) {
		super(message);
		this.name = "HFClientError";
	}
}

export class HFClient {
	private readonly proxyUrl: string;
	private readonly proxyApiKey: string;

	constructor() {
		this.proxyUrl = process.env.PROXY_URL || "";
		this.proxyApiKey = Resource.PROXY_API_KEY.value || "";

		if (!this.proxyUrl) {
			throw new Error("PROXY_URL is not configured");
		}

		if (!this.proxyApiKey) {
			throw new Error("PROXY_API_KEY is not configured");
		}
	}

	/**
	 * Make a GET request to the HackForums API
	 */
	async get<T = unknown>(path: string, accessToken?: string): Promise<T> {
		return this.request<T>("GET", path, undefined, accessToken);
	}

	/**
	 * Make a POST request to the HackForums API
	 */
	async post<T = unknown>(
		path: string,
		body?: unknown,
		accessToken?: string
	): Promise<T> {
		return this.request<T>("POST", path, body, accessToken);
	}

	/**
	 * Make a POST request with form-urlencoded data to the HackForums API
	 */
	async postForm<T = unknown>(
		path: string,
		formData: Record<string, string>,
		accessToken?: string
	): Promise<T> {
		return this.request<T>(
			"POST",
			path,
			formData,
			accessToken,
			"application/x-www-form-urlencoded"
		);
	}

	/**
	 * Internal request handler
	 */
	private async request<T>(
		method: "GET" | "POST",
		path: string,
		body?: unknown,
		accessToken?: string,
		contentType: string = "application/json"
	): Promise<T> {
		// Ensure path starts with /
		const normalizedPath = path.startsWith("/") ? path : `/${path}`;
		const url = `${this.proxyUrl}${normalizedPath}`;

		console.log(
			`[HFClient] ${method} ${normalizedPath}${accessToken ? " (authenticated)" : ""}`
		);

		try {
			const headers: Record<string, string> = {
				"Content-Type": contentType,
				"X-API-Key": this.proxyApiKey,
			};

			// Add Authorization header if access token is provided
			if (accessToken) {
				headers["Authorization"] = `Bearer ${accessToken}`;
			}

			// Prepare request body based on content type
			let requestBody: string | undefined;
			if (body) {
				if (contentType === "application/x-www-form-urlencoded") {
					// Convert object to URLSearchParams for form data
					const params = new URLSearchParams(
						body as Record<string, string>
					);
					requestBody = params.toString();
				} else {
					// Default to JSON
					requestBody = JSON.stringify(body);
				}
			}

			const response = await fetch(url, {
				method,
				headers,
				body: requestBody,
			});

			console.log(
				`[HFClient] ${method} ${normalizedPath} -> ${response.status}`
			);

			// Try to parse response as JSON
			let data: unknown;
			const responseContentType = response.headers.get("content-type");
			if (responseContentType?.includes("application/json")) {
				data = await response.json();
			} else {
				// If not JSON, get text for error reporting
				data = await response.text();
			}

			// Handle HTTP errors
			if (!response.ok) {
				const errorMessage =
					typeof data === "object" && data !== null && "error" in data
						? (data as { error?: string }).error ||
						  ("message" in data
								? (data as { message?: string }).message
								: undefined) ||
						  "HackForums API error"
						: typeof data === "string"
						? data
						: "HackForums API error";

				console.error(
					`[HFClient] Error ${response.status} on ${method} ${normalizedPath}:`,
					errorMessage
				);

				throw new HFClientError(errorMessage, response.status, data);
			}

			return data as T;
		} catch (error) {
			// Re-throw HFClientError as-is
			if (error instanceof HFClientError) {
				throw error;
			}

			// Wrap other errors
			if (error instanceof Error) {
				console.error(
					`[HFClient] Request failed for ${method} ${normalizedPath}:`,
					error.message
				);
				throw new HFClientError(
					`Failed to call HackForums API: ${error.message}`
				);
			}

			console.error(
				`[HFClient] Unknown error on ${method} ${normalizedPath}`
			);
			throw new HFClientError("Unknown error calling HackForums API");
		}
	}
}
