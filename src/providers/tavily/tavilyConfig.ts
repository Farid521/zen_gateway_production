/**
 * Internal record tracking usage per Tavily API key.
 */
export interface TavilyKeyInfo {
  id: number;
  key: string;
  used: number;
}

/**
 * Session returned by TavilyProvider.getTavilyKey().
 * - `key` is empty when no keys are available or all keys have reached the usage limit.
 * - `usedCount` is set to `TAVILY_EXHAUSTED_USED_COUNT` as a sentinel value when exhausted.
 */
export interface TavilyKeySession {
  key: string;
  usedCount: number;
}

/**
 * Maximum allowed usage per key before it is considered exhausted.
 */
export const TAVILY_USAGE_LIMIT = 850;

/**
 * Sentinel value returned when no keys are available.
 */
export const TAVILY_EXHAUSTED_USED_COUNT = 9999;
