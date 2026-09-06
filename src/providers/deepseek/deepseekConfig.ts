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

// ponytail: kunci flash, abaikan pro dari request
export function resolveDeepseekModel(_m?: string): string {
  return "deepseek-v4-flash";
}
