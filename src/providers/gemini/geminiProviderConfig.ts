import "dotenv/config";

export type GeminiModelId = "gemini-3.1-flash-lite" | "gemini-3.5-flash-lite";

export interface GeminiModelConfig {
  rpm: number;
  tpm: number;
  rpd: number;
}

export interface GeminiConfig {
  keys: string[];
  models: Record<GeminiModelId, GeminiModelConfig>;
}

// ponytail: WINDOW_MS/DAY_MS moved to geminiPool.ts (only consumer), keep config pure

/* =========================================================
 * INTERNAL STATE
 * ========================================================= */

export interface GeminiModelState {
  reservationId: string | null;
  requestTimestamps: number[];
  tokenUsages: { timestamp: number; tokens: number }[];
  dailyRequestCount: number;
  dailyResetAt: number;
}

export interface GeminiModel {
  id: GeminiModelId;
  rpm: number;
  tpm: number;
  rpd: number;
  state: GeminiModelState;
}

export interface GeminiKey {
  id: string;
  apiKey: string;
  models: Record<GeminiModelId, GeminiModel>;
}

/* =========================================================
 * RESERVED KEY
 * ========================================================= */

export interface ReservedGeminiKey {
  readonly reservationId: string;
  readonly keyId: string;
  readonly modelId: GeminiModelId;
  readonly apiKey: string;
  readonly rpm: number;
  readonly tpm: number;
  readonly rpd: number;
  release(): void;
  recordUsage(tokens: number): void;
}

export interface ReserveWaitOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

export const DEFAULT_GEMINI_MODELS: Record<GeminiModelId, GeminiModelConfig> = {
  "gemini-3.1-flash-lite": { rpm: 15, tpm: 100_000, rpd: 500 },
  "gemini-3.5-flash-lite": { rpm: 10, tpm: 80_000, rpd: 300 },
};

// ponytail: only GEMINI_KEY + GEMINI_KEY_N (comma-separated), order by suffix, dedup via Set
export function getGeminiKeysFromEnv(): string[] {
  const entries = Object.entries(process.env)
    .filter(([k, v]) => /^GEMINI_KEY(_\d+)?$/.test(k) && !!v?.trim())
    .map(([k, v]) => ({
      order: parseInt(k.match(/_(\d+)$/)?.[1] ?? "0", 10),
      parts: v!
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0),
    }))
    .sort((a, b) => a.order - b.order)
    .flatMap((e) => e.parts);

  return [...new Set(entries)];
}

export function createGeminiConfig(): GeminiConfig {
  return { keys: getGeminiKeysFromEnv(), models: DEFAULT_GEMINI_MODELS };
}
