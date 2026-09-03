/**
 * Base URL Tavily API
 * Docs: https://docs.tavily.com/documentation/api-reference/endpoint/search
 * curl --url https://api.tavily.com/search --header 'Authorization: Bearer tvly-...'
 */
export const TAVILY_API_BASE_URL = "https://api.tavily.com"

/**
 * Maximum allowed usage per API key before it is considered exhausted.
 * Advanced search require 2 credit per search, so 500 is very reliable limit
 */
export const TAVILY_USAGE_LIMIT = 500

/**
 * Sentinel value returned when no API keys are available or all have reached the limit.
 */
export const TAVILY_EXHAUSTED_USE_COUNT = 9999

/**
 * Internal record tracking usage per API key.
 */
export interface TavilyApiKeyRecord {
  id: number
  apiKey: string
  useCount: number
}

/**
 * Session returned by TavilyProvider.getApiKey().
 * - `apiKey` is empty when no keys are available or all have reached the limit.
 * - `useCount` is set to `TAVILY_EXHAUSTED_USE_COUNT` as a sentinel when exhausted.
 */
export interface TavilyApiKeySession {
  apiKey: string
  useCount: number
}
