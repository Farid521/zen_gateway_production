import { LlmCallAdapter } from "../src/driver/llm/llmCallDriver";
import { GeminiKeysPool } from "../src/providers/gemini/geminiProvider";
import { AgentCompletionResponse } from "../src/types/agent_types/agent_response";

const TOTAL = 20;
const CONCURRENCY = 5;
const CALL_TIMEOUT_MS = 30_000;
const MODEL_ID = "gemini-3.5-flash-lite";

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let tid: any;
  const timeout = new Promise<never>((_, rej) => {
    tid = setTimeout(() => rej(new Error(`call timeout after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([p, timeout]);
  } finally {
    clearTimeout(tid);
  }
}

async function testGemini20() {
  const pool = GeminiKeysPool.getInstance();
  const adapter = new LlmCallAdapter();

  console.log(`Starting 20 Gemini calls with concurrency = ${CONCURRENCY} using model ${MODEL_ID}...`);

  const startAll = Date.now();
  let ok = 0;
  let fail = 0;
  let totalTokens = 0;
  let queue = Array.from({ length: TOTAL }, (_, i) => i + 1);
  let idx = 0;

  async function worker(wid: number) {
    while (true) {
      const n = queue[idx++];
      if (!n) break;
      const t0 = Date.now();
      try {
        const session = await pool.reserveAsync(MODEL_ID, { timeoutMs: 30_000 });
        if (!session) {
          throw new Error("Failed to reserve Gemini key: timeout or no available keys");
        }

        const req = {
          model: MODEL_ID,
          messages: [{ role: "user", content: `Ping test #${n}: What is 1 + 1? Be extremely concise.` }],
        } as any;

        const res = await withTimeout(
          adapter.callGeminiAdapter(req, session),
          CALL_TIMEOUT_MS
        );

        const valid = AgentCompletionResponse.safeParse(res).success;
        totalTokens += res.usage?.total_tokens ?? 0;
        ok++;
        const snippet = res.choices[0]?.message?.content?.trim() ?? "";
        console.log(`#${n} [w${wid}] OK ${Date.now() - t0}ms | parse:${valid} | tok:${res.usage?.total_tokens} | key:${session.keyId} | -> "${snippet.slice(0, 40)}"`);
      } catch (e: any) {
        fail++;
        const msg = e?.error?.message ?? e?.message ?? String(e);
        console.log(`#${n} [w${wid}] THROW ${Date.now() - t0}ms | err: ${msg.slice(0, 120)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));

  console.log(`\n========================================`);
  console.log(`Summary Gemini Test:`);
  console.log(`Total Calls : ${TOTAL}`);
  console.log(`Success     : ${ok}`);
  console.log(`Failed      : ${fail}`);
  console.log(`Total Tokens: ${totalTokens}`);
  console.log(`Elapsed Time: ${Date.now() - startAll}ms`);
  console.log(`Concurrency : ${CONCURRENCY}`);
  console.log(`========================================`);
}

testGemini20().catch(console.error);
