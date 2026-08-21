/**
 * Represents the usage information for a single API key.
 */
interface KeyInfo {
  /** Unique identifier for the key */
  id: number;
  /** The actual API key string */
  key: string;
  /** Number of times this key has been used */
  used: number;
}

/**
 * Represents a Tavily API key session returned to consumers.
 */
export interface TavilyKeySession {
  /** The API key to use for the current request */
  key: string;
}

/**
 * Singleton provider that manages and distributes Tavily API keys.
 * Implements a round-robin strategy based on least usage to distribute load across keys.
 */
class TavilyProvider {
  private static instance: TavilyProvider | null = null;
  private usageRecords: KeyInfo[] = [];

  /**
   * Private constructor to prevent direct instantiation.
   * Initializes the provider by loading keys from environment variables.
   */
  private constructor() {
    this.loadKeysFromEnv();
  }

  /**
   * Loads API keys from the TAVILY_KEY environment variable.
   * Expects a comma-separated list of keys.
   */
  private loadKeysFromEnv(): void {
    const rawKeys = process.env.TAVILY_KEY;

    if (!rawKeys) {
      console.warn(
        "Warning: TAVILY_KEY not found in environment variables.",
      );
      return;
    }

    const keysList = rawKeys
      .split(",")
      .map((k) => k.trim())
      .filter((k) => k.length > 0);

    this.usageRecords = keysList.map((key, index) => ({
      id: index + 1,
      key,
      used: 0,
    }));
  }

  /**
   * Returns the singleton instance of TavilyProvider.
   * Creates the instance on first call if it doesn't exist.
   */
  public static getInstance(): TavilyProvider {
    if (!TavilyProvider.instance) {
      TavilyProvider.instance = new TavilyProvider();
    }

    return TavilyProvider.instance;
  }

  /**
   * Retrieves the least-used API key.
   *
   * The usage counter is incremented immediately when a key is allocated,
   * not after the API request completes.
   */
  public getTavilyKey(): TavilyKeySession {
    const availableRecords = this.usageRecords.filter(
      (record) => record.used < 850,
    );

    if (availableRecords.length === 0) {
      throw new Error(
        "No Tavily API keys available or all keys have reached the usage limit (850).",
      );
    }

    // Find the key with the least usage
    const selectedRecord = availableRecords.reduce(
      (min, record) => (record.used < min.used ? record : min),
      availableRecords[0],
    );

    selectedRecord.used += 1;

    return {
      key: selectedRecord.key,
    };
  }

  /**
   * Returns the usage records for all loaded API keys.
   */
  public getUsageRecords(): KeyInfo[] {
    return this.usageRecords;
  }
}

export default TavilyProvider;
