import "dotenv/config";

/* =========================================================
 * OPENROUTER CONFIG
 * ========================================================= */

export interface OpenRouterConfig {
  apiKey: string;
  baseUrl: string;
  requestTimeout: number;
}

export const DEFAULT_OPENROUTER_CONFIG: OpenRouterConfig = {
  apiKey: "",
  baseUrl: "https://openrouter.ai/api/v1",
  requestTimeout: 60_000,
};

/* =========================================================
 * ENV LOADING
 * ========================================================= */

export function getOpenRouterKeyFromEnv(): string {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key || !key.trim()) {
    throw new Error(
      "[OpenRouterConfig] OPENROUTER_API_KEY is not set in environment.",
    );
  }
  return key.trim();
}

export function createOpenRouterConfig(): OpenRouterConfig {
  return {
    ...DEFAULT_OPENROUTER_CONFIG,
    apiKey: getOpenRouterKeyFromEnv(),
  };
}
