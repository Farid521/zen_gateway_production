import assert from "node:assert";
import {
  classifyUpstreamError,
  hasUsableOutput,
  isQuotaError,
} from "../src/driver/llm/llmCallDriver";

// ── Lapis 3: gangguan sementara -> fallback ke DeepSeek ──────────────────────

// Kasus nyata dari server: Gemini 503 "high demand"
assert.equal(
  classifyUpstreamError(
    503,
    { code: 503, status: "UNAVAILABLE" },
    "This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.",
  ),
  "transient",
);

assert.equal(classifyUpstreamError(500, { code: 500 }, "Internal error encountered."), "transient");
assert.equal(classifyUpstreamError(504, { code: 504 }, "Deadline exceeded"), "transient");
assert.equal(
  classifyUpstreamError(200, { status: "UNAVAILABLE" }, "Service unavailable"),
  "transient",
);

// ── Kuota tetap punya kode sendiri ──────────────────────────────────────────

assert.equal(isQuotaError(429, { code: 429 }, "Too many requests"), true);
assert.equal(
  classifyUpstreamError(429, { code: 429, status: "RESOURCE_EXHAUSTED" }, "Quota exceeded"),
  "quota",
);

// ── Lapis 2 / auth: 4xx ─────────────────────────────────────────────────────

assert.equal(
  classifyUpstreamError(400, { code: 400, status: "INVALID_ARGUMENT" }, "Invalid JSON payload received."),
  "bad_request",
);
assert.equal(
  classifyUpstreamError(400, { code: 400 }, "Function call is missing a thought_signature"),
  "bad_request",
);
assert.equal(
  classifyUpstreamError(403, { code: 403, status: "PERMISSION_DENIED" }, "Permission denied"),
  "auth",
);
assert.equal(classifyUpstreamError(401, { code: 401 }, "API key not valid"), "auth");

// ── hasUsableOutput: tool_calls dan reasoning_content tetap dianggap sah ────

assert.equal(hasUsableOutput({ choices: [{ message: { content: "halo" } }] } as any), true);
assert.equal(hasUsableOutput({ choices: [{ message: { content: null } }] } as any), false);
assert.equal(hasUsableOutput({ choices: [{ message: { content: "" } }] } as any), false);
assert.equal(
  hasUsableOutput({
    choices: [{ message: { content: "", tool_calls: [{ id: "1", type: "function" }] } }],
  } as any),
  true,
);
assert.equal(
  hasUsableOutput({ choices: [{ message: { content: null, reasoning_content: "berpikir..." } }] } as any),
  true,
);

console.log("OK: klasifikasi error upstream lulus semua (12 assertion)");
