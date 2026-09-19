import assert from "node:assert";

// harus diset sebelum modul driver di-import (deepseekConfig membaca env saat import)
process.env.DEEPSEEK_API_KEY = "test-deepseek-key";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function okBody(content: string, model: string) {
  return {
    id: "chatcmpl-test",
    object: "chat.completion",
    created: 1,
    model,
    choices: [
      { index: 0, message: { role: "assistant", content }, finish_reason: "stop", logprobs: null },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  };
}

// 503 asli dari server: Gemini "high demand"
const GEMINI_HIGH_DEMAND = [
  {
    error: {
      code: 503,
      message:
        "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
      status: "UNAVAILABLE",
    },
  },
];

const urlCalls: string[] = [];
let geminiResponse: () => Response;
let deepseekResponse: () => Response;

globalThis.fetch = (async (url: any) => {
  const u = String(url);
  urlCalls.push(u);
  if (u.includes("generativelanguage.googleapis.com")) return geminiResponse();
  if (u.includes("api.deepseek.com")) return deepseekResponse();
  throw new Error(`unexpected fetch: ${u}`);
}) as any;

async function main() {
  const { LlmCallAdapter } = await import("../src/driver/llm/llmCallDriver");
  const adapter = new LlmCallAdapter();
  const request = {
    model: "gemini-3.1-flash-lite",
    messages: [{ role: "user", content: "hai" }],
  } as any;
  const session = {
    modelId: "gemini-3.1-flash-lite",
    apiKey: "test",
    release() {},
    recordUsage() {},
  } as any;

  // 1. Gemini 503 "high demand" -> DeepSeek dipakai (kasus yang terjadi di server)
  urlCalls.length = 0;
  geminiResponse = () => json(GEMINI_HIGH_DEMAND, 503);
  deepseekResponse = () => json(okBody("halo dari deepseek", "deepseek-v4-flash"));
  const r1 = await adapter.callWithFallback(request, session);
  assert.equal(r1.choices[0].message.content, "halo dari deepseek");
  assert.equal(urlCalls.length, 2);
  assert.match(urlCalls[0], /generativelanguage\.googleapis\.com/);
  assert.match(urlCalls[1], /api\.deepseek\.com/);

  // 2. Gemini 200 tapi konten kosong -> tetap dicoba ke DeepSeek
  urlCalls.length = 0;
  geminiResponse = () => json(okBody("", "gemini-3.1-flash-lite"));
  deepseekResponse = () => json(okBody("jawaban deepseek", "deepseek-v4-flash"));
  const r2 = await adapter.callWithFallback(request, session);
  assert.equal(r2.choices[0].message.content, "jawaban deepseek");
  assert.equal(urlCalls.length, 2);

  // 3. Dua-duanya menolak 400 -> error Gemini (400), bukan 502
  urlCalls.length = 0;
  geminiResponse = () =>
    json(
      {
        error: {
          code: 400,
          message: "Gemini: function call is missing a thought_signature",
          status: "INVALID_ARGUMENT",
        },
      },
      400,
    );
  deepseekResponse = () =>
    json({ error: { code: 400, message: "DeepSeek: invalid request", type: "invalid_request_error" } }, 400);
  await assert.rejects(
    () => adapter.callWithFallback(request, session),
    (e: any) =>
      e.error.code === "upstream_bad_request" &&
      e.error.type === "invalid_request_error" &&
      e.message.includes("Gemini"),
  );
  assert.equal(urlCalls.length, 2);

  // 4. Dua-duanya 5xx -> error provider_unavailable (route mengubahnya jadi 503)
  urlCalls.length = 0;
  geminiResponse = () => json(GEMINI_HIGH_DEMAND, 503);
  deepseekResponse = () =>
    json({ error: { code: 503, message: "DeepSeek down", type: "server_error" } }, 503);
  await assert.rejects(
    () => adapter.callWithFallback(request, session),
    (e: any) => e.error.code === "provider_unavailable" && e.error.details.upstreamStatus === 503,
  );
  assert.equal(urlCalls.length, 2);

  console.log("OK: alur fallback lulus 4 skenario");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
