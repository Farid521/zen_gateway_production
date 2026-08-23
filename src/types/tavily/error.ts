import { z } from "zod";

// ============================================================
// 1. RAW TAVILY ERROR
// ============================================================
//
// This schema represents the error response exactly as returned
// by the Tavily API.
//
// Example:
// {
//   "detail": {
//     "error": "Rate limit exceeded"
//   }
// }
//
// This schema should stay close to Tavily's API contract.
// ============================================================

export const TavilyRawErrorResponseSchema = z.object({
  detail: z.object({
    error: z.string(),
  }),
});

export type TavilyRawErrorResponse = z.infer<
  typeof TavilyRawErrorResponseSchema
>;

// ============================================================
// 2. CUSTOM ERROR TYPES
// ============================================================
//
// These types belong to our application, not to Tavily.
//
// Their purpose is to convert different Tavily/API failures into
// a consistent format that the rest of the application can use.
// ============================================================

export const TavilyErrorCodeSchema = z.enum([
  "INVALID_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "RATE_LIMITED",
  "QUOTA_EXCEEDED",
  "INTERNAL_ERROR",
  "TIMEOUT",
  "UNKNOWN",
]);

export type TavilyErrorCode = z.infer<typeof TavilyErrorCodeSchema>;

export const TavilyEndpointSchema = z.enum([
  "search",
  "extract",
  "crawl",
  "map",
]);

export type TavilyEndpoint = z.infer<typeof TavilyEndpointSchema>;

// ============================================================
// Normalized error information used by our application.
// ============================================================

export interface TavilyErrorInfo {
  /** Normalized machine-readable error code. */
  code: TavilyErrorCode;

  /** Human-readable error message. */
  message: string;

  /** HTTP status returned by Tavily, if available. */
  httpStatus: number | null;

  /** Tavily endpoint that failed. */
  endpoint?: TavilyEndpoint;

  /** Whether retrying the request may succeed. */
  retryable: boolean;

  /** Original error message returned by Tavily. */
  raw: string;

  /** Optional suggestion for handling the error. */
  hint?: string;
}

// ============================================================
// 3. ERROR PARSER
// ============================================================
//
// Converts a raw Tavily/API error into our normalized format.
//
// Input:
//   HTTP status + raw error message
//
// Output:
//   TavilyErrorInfo
//
// This is the boundary between the external Tavily format and
// our internal application format.
// ============================================================

export function parseTavilyError(
  httpStatus: number | null,
  raw: string,
  endpoint?: TavilyEndpoint,
): TavilyErrorInfo {
  const message = raw;
  const lower = raw.toLowerCase();

  // ----------------------------------------------------------
  // 400 - Invalid request
  // ----------------------------------------------------------
  if (
    httpStatus === 400 ||
    lower.includes("bad request") ||
    lower.includes("max 20 urls") ||
    lower.includes("no starting url") ||
    lower.includes("empty query")
  ) {
    return {
      code: "INVALID_REQUEST",
      message,
      httpStatus,
      endpoint,
      retryable: false,
      raw,
      hint: "Check the request parameters, such as query or URL.",
    };
  }

  // ----------------------------------------------------------
  // 401 - Authentication failure
  // ----------------------------------------------------------
  if (
    httpStatus === 401 ||
    lower.includes("unauthorized") ||
    lower.includes("api key")
  ) {
    return {
      code: "UNAUTHORIZED",
      message,
      httpStatus,
      endpoint,
      retryable: false,
      raw,
      hint: "Check the Tavily API key or Bearer token.",
    };
  }

  // ----------------------------------------------------------
  // 403 - Forbidden / unsupported resource
  // ----------------------------------------------------------
  if (
    httpStatus === 403 ||
    lower.includes("forbidden") ||
    lower.includes("not supported")
  ) {
    return {
      code: "FORBIDDEN",
      message,
      httpStatus,
      endpoint,
      retryable: false,
      raw,
      hint: "The requested URL or resource is not supported by Tavily.",
    };
  }

  // ----------------------------------------------------------
  // 429 - Rate limit
  // ----------------------------------------------------------
  if (
    httpStatus === 429 ||
    lower.includes("rate limit") ||
    lower.includes("excessive requests") ||
    lower.includes("blocked due to")
  ) {
    return {
      code: "RATE_LIMITED",
      message,
      httpStatus,
      endpoint,
      retryable: true,
      raw,
      hint: "Reduce request frequency and retry with backoff.",
    };
  }

  // ----------------------------------------------------------
  // 432 - Quota exceeded
  // ----------------------------------------------------------
  if (
    httpStatus === 432 ||
    lower.includes("usage limit") ||
    lower.includes("pay-as-you-go limit") ||
    lower.includes("upgrade your plan")
  ) {
    return {
      code: "QUOTA_EXCEEDED",
      message,
      httpStatus,
      endpoint,
      retryable: false,
      raw,
      hint: "The Tavily quota has been exceeded.",
    };
  }

  // ----------------------------------------------------------
  // 500 - Internal server error
  // ----------------------------------------------------------
  if (httpStatus === 500 || lower.includes("internal server error")) {
    return {
      code: "INTERNAL_ERROR",
      message,
      httpStatus,
      endpoint,
      retryable: true,
      raw,
      hint: "Tavily encountered an internal error. Retry with backoff.",
    };
  }

  // ----------------------------------------------------------
  // 504 - Timeout
  // ----------------------------------------------------------
  if (
    httpStatus === 504 ||
    lower.includes("timeout") ||
    lower.includes("timed out")
  ) {
    return {
      code: "TIMEOUT",
      message,
      httpStatus,
      endpoint,
      retryable: true,
      raw,
      hint: "The request timed out. Retry or reduce the request scope.",
    };
  }

  // ----------------------------------------------------------
  // Unknown error
  // ----------------------------------------------------------
  return {
    code: "UNKNOWN",
    message,
    httpStatus,
    endpoint,
    retryable: false,
    raw,
  };
}

// ============================================================
// 4. CUSTOM TAVILY ERROR
// ============================================================
//
// This class represents the final error object used by our
// application.
//
// It extends JavaScript's built-in Error so it can be thrown
// and caught normally, while also carrying additional Tavily-
// specific information such as:
//   - error code
//   - HTTP status
//   - endpoint
//   - retryability
//   - original error message
//   - handling hint
//
// Example:
//
//   throw new TavilyError(errorInfo);
//
//   catch (error) {
//     if (error instanceof TavilyError) {
//       console.log(error.code);
//     }
//   }
// ============================================================

export class TavilyError extends Error {
  readonly code: TavilyErrorCode;
  readonly httpStatus: number | null;
  readonly endpoint?: TavilyEndpoint;
  readonly retryable: boolean;
  readonly raw: string;
  readonly hint?: string;

  constructor(info: TavilyErrorInfo) {
    // Initialize the built-in Error with the human-readable message.
    super(info.message);

    // Give the error a specific name for logging and debugging.
    this.name = "TavilyError";

    // Store the normalized Tavily error information.
    this.code = info.code;
    this.httpStatus = info.httpStatus;
    this.endpoint = info.endpoint;
    this.retryable = info.retryable;
    this.raw = info.raw;
    this.hint = info.hint;

    // Ensure the prototype chain is correct so that
    // `error instanceof TavilyError` works reliably.
    Object.setPrototypeOf(this, new.target.prototype);
  }
} 

// ============================================================
// 5. ERROR FACTORY
// ============================================================
//
// Creates a TavilyError from raw Tavily error information.
//
// The caller only needs to provide the HTTP status, raw error
// message, and endpoint. This function handles the two internal
// steps automatically:
//
//   1. Parse the raw error into TavilyErrorInfo.
//   2. Create a TavilyError from that normalized information.
//
// This keeps error parsing and error construction in one place,
// so callers do not need to know how either step is implemented.
//
// Example:
//
//   throw createTavilyError(
//     429,
//     "Too many requests",
//     "search",
//   );
// ============================================================

export function createTavilyError(
  httpStatus: number | null,
  raw: string,
  endpoint?: TavilyEndpoint,
): TavilyError {
  // Convert the raw Tavily error into our normalized
  // application-level error format.
  const errorInfo = parseTavilyError(httpStatus, raw, endpoint);

  // Create the actual JavaScript Error object that can be thrown.
  return new TavilyError(errorInfo);
}
