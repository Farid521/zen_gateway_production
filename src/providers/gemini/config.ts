export type GeminiModelId =
  | "gemini-3.1-flash-lite"
  | "gemini-3.5-flash-lite";

export interface GeminiModelConfig {
  rpm: number;
  tpm: number;
  rpd: number;
}

export interface GeminiConfig {
  keys: string[];

  models: Record<
    GeminiModelId,
    GeminiModelConfig
  >;
}

export const geminiConfig: GeminiConfig = {
  keys: [
    process.env.GEMINI_KEY_1!,
    process.env.GEMINI_KEY_2!,
    process.env.GEMINI_KEY_3!,
  ],

  models: {
    "gemini-3.1-flash-lite": {
      rpm: 15,
      tpm: 100_000,
      rpd: 500,
    },

    "gemini-3.5-flash-lite": {
      rpm: 10,
      tpm: 80_000,
      rpd: 300,
    },
  },
};