import { Resource } from "sst";

/**
 * HackForums API Client
 *
 * Routes all requests through the EC2 proxy which handles:
 * - IP whitelisting (static Elastic IP)
 * - HF credential injection
 * - Request validation
 */

// ============================================
// Types
// ============================================

export interface HFClientConfig {
  proxyUrl?: string;
  proxyApiKey?: string;
}

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

// ============================================
// Client
// ============================================

export class HFClient {
  private readonly proxyUrl: string;
  private readonly proxyApiKey: string;

  constructor(config?: HFClientConfig) {
    // Use provided config or fall back to environment variables
    this.proxyUrl = config?.proxyUrl || process.env.PROXY_URL || "";
    this.proxyApiKey = config?.proxyApiKey || Resource.PROXY_API_KEY.value || "";

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
  async get<T = unknown>(path: string): Promise<T> {
    return this.request<T>("GET", path);
  }

  /**
   * Make a POST request to the HackForums API
   */
  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    return this.request<T>("POST", path, body);
  }

  /**
   * Internal request handler
   */
  private async request<T>(
    method: "GET" | "POST",
    path: string,
    body?: unknown
  ): Promise<T> {
    // Ensure path starts with /
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${this.proxyUrl}${normalizedPath}`;

    try {
      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.proxyApiKey,
        },
        body: body ? JSON.stringify(body) : undefined,
      });

      // Try to parse response as JSON
      let data: unknown;
      const contentType = response.headers.get("content-type");
      if (contentType?.includes("application/json")) {
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
              ("message" in data ? (data as { message?: string }).message : undefined) ||
              "HackForums API error"
            : typeof data === "string"
            ? data
            : "HackForums API error";

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
        throw new HFClientError(
          `Failed to call HackForums API: ${error.message}`
        );
      }

      throw new HFClientError("Unknown error calling HackForums API");
    }
  }
}

// Factory function for creating instances
export function createHFClient(config?: HFClientConfig): HFClient {
  return new HFClient(config);
}
