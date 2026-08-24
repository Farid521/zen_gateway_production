import { z } from "zod";
import { TAVILY_API_BASE_URL } from "../../../providers/tavily/tavilyConfig";
import type { TavilyApiKeySession } from "../../../providers/tavily/tavilyConfig";
import type {
  TavilySearchRequest,
  TavilySearchResponse,
} from "../../../types/tavily/search";
import { TavilySearchResponseSchema } from "../../../types/tavily/search";
import type {
  TavilyCrawlRequest,
  TavilyCrawlResponse,
} from "../../../types/tavily/crawl";
import { TavilyCrawlResponseSchema } from "../../../types/tavily/crawl";
import type {
  TavilyExtractRequest,
  TavilyExtractResponse,
} from "../../../types/tavily/extract";
import { TavilyExtractResponseSchema } from "../../../types/tavily/extract";
import { createTavilyError } from "../../../types/tavily/error";
import type { TavilyEndpoint } from "../../../types/tavily/error";

/**
 * TavilyProvider acts as a client driver for the Tavily API,
 * providing methods to interact with search, extract, and crawl endpoints.
 */
export class TavilyProvider {
  constructor() {}

  /**
   * Private generic helper to execute any Tavily API request with unified
   * error handling, timeout control, and Zod response validation.
   */
  private static async request<TResponse>(
    session: TavilyApiKeySession,
    endpoint: TavilyEndpoint,
    body: unknown,
    schema: z.ZodSchema<TResponse>,
    options: {
      timeoutMs?: number;
      emptyCheck?: (data: TResponse) => boolean;
      emptyMessage?: string;
    } = {},
  ): Promise<TResponse> {
    // Ensure we have a valid API key before proceeding
    if (!session.apiKey) {
      throw createTavilyError(
        401,
        "no API key available, all keys exhausted",
        endpoint,
      );
    }

    const timeoutMs = options.timeoutMs ?? 30_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(`${TAVILY_API_BASE_URL}/${endpoint}`, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${session.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      // Handle non-OK HTTP responses
      if (!res.ok) {
        const raw = await res.text().catch(() => "unknown error");
        throw createTavilyError(res.status, raw, endpoint);
      }

      // Parse and validate the response against the schema
      const data = await res.json();
      const parsed = schema.safeParse(data);

      if (!parsed.success) {
        throw createTavilyError(
          200,
          `invalid response schema: ${parsed.error.issues.map((i) => i.message).join(", ")}`,
          endpoint,
        );
      }

      // Ensure at least one result is returned (if check provided)
      if (options.emptyCheck && options.emptyCheck(parsed.data)) {
        throw createTavilyError(
          200,
          options.emptyMessage ?? "no results found",
          endpoint,
        );
      }

      return parsed.data;
    } catch (err) {
      // Re-throw if already a TavilyError
      if (err && typeof err === "object" && "code" in err) {
        throw err;
      }

      // Handle abort (timeout) errors
      if (err instanceof Error && err.name === "AbortError") {
        throw createTavilyError(
          504,
          `request timed out after ${timeoutMs}ms`,
          endpoint,
        );
      }

      // Handle general errors
      throw createTavilyError(
        500,
        err instanceof Error ? err.message : "unknown error",
        endpoint,
      );
    } finally {
      // Always clear the timer to avoid resource leaks
      clearTimeout(timer);
    }
  }

  /**
   * Executes a search query using the Tavily API.
   *
   * @param session - The API key session containing a valid key for authorization.
   * @param message - The search request parameters.
   * @returns A promise resolving to the full search response.
   * @throws TavilyError if the request fails, times out, or returns no results.
   */
  public async search(
    session: TavilyApiKeySession,
    message: TavilySearchRequest,
  ): Promise<TavilySearchResponse> {
    return TavilyProvider.request<TavilySearchResponse>(
      session,
      "search",
      message,
      TavilySearchResponseSchema,
      {
        timeoutMs: 30_000,
        emptyCheck: (data) => data.results.length === 0,
        emptyMessage: "no search results found",
      },
    );
  }

  /**
   * Executes a website crawl using the Tavily API.
   *
   * @param session - The API key session containing a valid key for authorization.
   * @param message - The crawl request parameters.
   * @returns A promise resolving to the full crawl response.
   * @throws TavilyError if the request fails, times out, or returns no results.
   */
  public async crawl(
    session: TavilyApiKeySession,
    message: TavilyCrawlRequest,
  ): Promise<TavilyCrawlResponse> {
    const timeoutMs = message.timeout ? message.timeout * 1000 : 30_000;
    return TavilyProvider.request<TavilyCrawlResponse>(
      session,
      "crawl",
      message,
      TavilyCrawlResponseSchema,
      {
        timeoutMs,
        emptyCheck: (data) => data.results.length === 0,
        emptyMessage: "no crawl results found",
      },
    );
  }

  /**
   * Extracts content from one or more URLs using the Tavily API.
   *
   * @param session - The API key session containing a valid key for authorization.
   * @param message - The extract request parameters.
   * @returns A promise resolving to the full extract response.
   * @throws TavilyError if the request fails, times out, or returns no results.
   */
  public async extract(
    session: TavilyApiKeySession,
    message: TavilyExtractRequest,
  ): Promise<TavilyExtractResponse> {
    const timeoutMs = message.timeout ? message.timeout * 1000 : 30_000;
    return TavilyProvider.request<TavilyExtractResponse>(
      session,
      "extract",
      message,
      TavilyExtractResponseSchema,
      {
        timeoutMs,
        emptyCheck: (data) =>
          data.results.length === 0 && data.failed_results.length === 0,
        emptyMessage: "no extract results found",
      },
    );
  }
}

export default TavilyProvider;
