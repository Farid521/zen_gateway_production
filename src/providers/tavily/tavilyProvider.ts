import {
  TavilyKeyInfo,
  TavilyKeySession,
  TAVILY_USAGE_LIMIT,
  TAVILY_EXHAUSTED_USED_COUNT,
} from "./tavilyConfig";

export type { TavilyKeySession } from "./tavilyConfig";

class TavilyProvider {
  private static instance: TavilyProvider | null = null;
  private usageRecords: TavilyKeyInfo[] = [];


  private constructor() {
    this.loadKeysFromEnv();
  }


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

    console.log(keysList)

    this.usageRecords = keysList.map((key, index) => ({
      id: index + 1,
      key,
      used: 0,
    }));
  }

  public static getInstance(): TavilyProvider {
    if (!TavilyProvider.instance) {
      TavilyProvider.instance = new TavilyProvider();
    }

    return TavilyProvider.instance;
  }

  public getTavilyKey(): TavilyKeySession {
    const availableRecords = this.usageRecords.filter(
      (record) => record.used < TAVILY_USAGE_LIMIT,
    );

    // Return sentinel value instead of throwing to stay consistent with other providers; error handling is delegated to the adapter.
    if (availableRecords.length === 0) {
      return {
        key: "",
        usedCount: TAVILY_EXHAUSTED_USED_COUNT
      };
    }

    // Select the least-used available key
    const selectedRecord = availableRecords.reduce(
      (min, record) => (record.used < min.used ? record : min),
      availableRecords[0],
    );

    selectedRecord.used += 1;

    return {
      key: selectedRecord.key,
      usedCount: selectedRecord.used
    };
  }

  public getUsageRecords(): TavilyKeyInfo[] {
    return this.usageRecords;
  }
}

export default TavilyProvider;
