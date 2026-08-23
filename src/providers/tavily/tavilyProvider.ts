import {
  TAVILY_USAGE_LIMIT,
  TAVILY_EXHAUSTED_USE_COUNT,
  TavilyApiKeyRecord,
  TavilyApiKeySession,
} from "./tavilyConfig"

export class TavilyProvider {
  private static instance: TavilyProvider | null = null
  private records: TavilyApiKeyRecord[] | null = null

  private constructor() {}

  /**
   * Returns the singleton instance of TavilyProvider.
   */
  public static getInstance(): TavilyProvider {
    if (!TavilyProvider.instance) {
      TavilyProvider.instance = new TavilyProvider()
    }
    return TavilyProvider.instance
  }

  /**
   * Initializes API key records from environment variables if not already initialized.
   */
  private initiateRecords(): void {
    if (this.records !== null) {
      return
    }

    const keys = this.getKeysFromEnv()

    this.records = keys.map((apiKey, index) => ({
      id: index + 1,
      apiKey,
      useCount: 0,
    }))
  }

  /**
   * Retrieves API keys from the TAVILY_API_KEY environment variable.
   * Expects a comma-separated list of keys (e.g. "tvly-aaa,tvly-bbb").
   * Docs: Bearer tvly-YOUR_API_KEY (https://docs.tavily.com/documentation/api-reference/endpoint/search)
   */
  private getKeysFromEnv(): string[] {
    const raw = process.env.TAVILY_API_KEY

    if (!raw || raw.trim().length === 0) {
      console.warn(
        "Warning: TAVILY_API_KEY not found in environment variables."
      )
      return []
    }

    return raw
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0)
      .filter((k, i, arr) => arr.indexOf(k) === i)
  }

  /**
   * Returns the least-used API key and increments its usage count.
   * Filters out keys that have reached the usage limit (500).
   * Returns a sentinel session with empty apiKey if none available.
   */
  public getApiKey(): TavilyApiKeySession {
    if (this.records === null) {
      this.initiateRecords()
    }

    if (!this.records || this.records.length === 0) {
      return {
        apiKey: "",
        useCount: TAVILY_EXHAUSTED_USE_COUNT,
      }
    }

    const available = this.records.filter(
      (record) => record.useCount < TAVILY_USAGE_LIMIT
    )

    if (available.length === 0) {
      console.warn("no tavily api key available, all keys exhausted")
      return {
        apiKey: "",
        useCount: TAVILY_EXHAUSTED_USE_COUNT,
      }
    }

    const selected = available.reduce(
      (min, record) => (record.useCount < min.useCount ? record : min),
      available[0]
    )

    selected.useCount += 1

    return {
      apiKey: selected.apiKey,
      useCount: selected.useCount,
    }
  }

  /**
   * Helper: returns Authorization header value for direct fetch usage.
   * Example: "Bearer tvly-xxx"
   * Note: this also increments usage via getApiKey().
   */
  public getAuthHeader(): string {
    const { apiKey } = this.getApiKey()
    return apiKey ? `Bearer ${apiKey}` : ""
  }

  /**
   * Test helper: reset singleton (only for tests).
   */
  public static _resetForTest(): void {
    TavilyProvider.instance = null
  }
}

export default TavilyProvider
