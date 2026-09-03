import assert from "node:assert";
import { AgentCompletionRequest } from "../src/types/agent_types/agent_request";
import { toGeminiContents, toGeminiConfig } from "../src/providers/gemini/geminiRequestConverter";

// ── 1. Raw OpenAI request (mirip body dari HTTP POST /v1/chat/completions) ──

const rawRequest = {
  model: "gpt-4o",
  messages: [
    { role: "system", content: "You are a pirate. Reply in pirate speak." },
    { role: "system", content: "Always be concise." },
    { role: "user", content: "What is the capital of France?" },
    { role: "assistant", content: "Arrr, the capital be Paris!" },
    { role: "user", content: [
      { type: "text", text: "And what about Japan?" },
      { type: "image_url", image_url: { url: "data:image/png;base64,abc..." } },
    ] },
    { role: "user", content: "One more thing" },
  ],
  temperature: 0.8,
  top_p: 0.95,
  max_tokens: 512,
  stop: ["END"],
  response_format: { type: "json_object" as const },
  frequency_penalty: 0.2,
  presence_penalty: 0.1,
};

// ── 2. Parse via Zod schema ──

const parsed = AgentCompletionRequest.safeParse(rawRequest);
assert.ok(parsed.success, `Zod parse failed: ${JSON.stringify(parsed.error?.issues)}`);
const request = parsed.data;

// ── 3. Convert → Gemini ──

const contents = toGeminiContents(request);
const config = toGeminiConfig(request);

// ── 4. Assert contents ──

// system dipisah, assistant→model, image_url ditext-onlykan
assert.strictEqual(contents.length, 4, "skip 2 system + 1 image-only = 4 contents");

// [0] user "What is the capital of France?"
assert.strictEqual(contents[0].role, "user");
assert.strictEqual(contents[0].parts?.[0]?.text, "What is the capital of France?");

// [1] assistant "Arrr, the capital be Paris!"  → role "model"
assert.strictEqual(contents[1].role, "model");
assert.strictEqual(contents[1].parts?.[0]?.text, "Arrr, the capital be Paris!");

// [2] user "And what about Japan?"  → image_url part ditext-only filter, tetap ada text "And what about Japan?"
assert.strictEqual(contents[2].role, "user");
assert.strictEqual(contents[2].parts?.[0]?.text, "And what about Japan?");

// [3] user "One more thing"
assert.strictEqual(contents[3].role, "user");
assert.strictEqual(contents[3].parts?.[0]?.text, "One more thing");

// ── 5. Assert config ──

assert.deepStrictEqual(config.systemInstruction, {
  parts: [{ text: "You are a pirate. Reply in pirate speak.\n\nAlways be concise." }],
});
assert.strictEqual(config.temperature, 0.8);
assert.strictEqual(config.topP, 0.95);
assert.strictEqual(config.maxOutputTokens, 512);
assert.deepStrictEqual(config.stopSequences, ["END"]);
assert.strictEqual(config.responseMimeType, "application/json");
assert.strictEqual(config.frequencyPenalty, 0.2);
assert.strictEqual(config.presencePenalty, 0.1);

// ── 6. Minimal request (no optional params) ──

const minimal = AgentCompletionRequest.safeParse({
  model: "test",
  messages: [{ role: "user", content: "hi" }],
});
assert.ok(minimal.success);

const minContents = toGeminiContents(minimal.data);
const minConfig = toGeminiConfig(minimal.data);

assert.strictEqual(minContents.length, 1);
assert.strictEqual(minContents[0].role, "user");
assert.strictEqual(minContents[0].parts?.[0]?.text, "hi");
assert.strictEqual(minConfig.systemInstruction, undefined);
assert.strictEqual(minConfig.temperature, undefined);
assert.strictEqual(minConfig.topP, undefined);

// ── 7. Zod validation rejects invalid ──

const bad = AgentCompletionRequest.safeParse({
  model: "test",
  messages: [],
});
assert.ok(!bad.success, "should reject empty messages");

const bad2 = AgentCompletionRequest.safeParse({
  messages: [{ role: "user", content: "hi" }],
});
assert.ok(!bad2.success, "should reject missing model");

console.log("All schema + converter tests passed.");
