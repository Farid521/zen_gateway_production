import "dotenv/config";

export const DEEPSEEK_IDS = new Set([
  "deepseek-v4-flash",
  "deepseek-v4-pro",
  "deepseek-v4-flash-vision-exp",
]);

export const deepseekConfig = {
  baseUrl: "https://api.deepseek.com/chat/completions",
  apiKey: process.env.DEEPSEEK_API_KEY ?? "",
  defaultModel: "deepseek-v4-flash",
};

// ponytail: id DeepSeek valid -> pakai, selain itu -> default flash
export function resolveDeepseekModel(m?: string): string {
  return m && DEEPSEEK_IDS.has(m) ? m : deepseekConfig.defaultModel;
}
