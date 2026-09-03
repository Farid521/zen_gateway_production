import { LlmCallAdapter } from "../src/driver/llm/llmCallDriver";
import { OpencodeProvider } from "../src/providers/opencode/opencodeProvider";
import { AgentCompletionResponse } from "../src/types/agent_types/agent_response";

const TOTAL = 20;
const CONCURRENCY = 4;
const CALL_TIMEOUT_MS = 30_000;

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

async function testOpencode20() {
  OpencodeProvider.getInstance();
  let best = OpencodeProvider.getBestModel();
  const timeoutMs = 25_000;
  const start = Date.now();
  while (!best && Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 500));
    best = OpencodeProvider.getBestModel();
  }
  if (!best) {
    console.warn(`no available model after ${timeoutMs}ms — aborting`);
    return;
  }
  console.log(`best model: ${best.model} (ready in ${Date.now() - start}ms)`);

  const adapter = new LlmCallAdapter();
  const startAll = Date.now();
  let ok = 0, fail = 0;
  let totalTokens = 0;
  let queue = Array.from({ length: TOTAL }, (_, i) => i + 1);
  let idx = 0;

  async function worker(wid: number) {
    while (true) {
      const n = queue[idx++];
      if (!n) break;
      const t0 = Date.now();
      const sessionId = `test-session-${n}`;
      try {
        const req = {
          model: best!.model,
          messages: [{ role: "user", content: `ping #${n}` }],
        } as any;

        const res = await withTimeout(
          adapter.opencodeCallAdapter(best!.model, req, sessionId),
          CALL_TIMEOUT_MS
        );
        const valid = AgentCompletionResponse.safeParse(res).success;
        totalTokens += res.usage?.total_tokens ?? 0;
        ok++;
        console.log(`#${n} [w${wid}] OK ${Date.now() - t0}ms parse:${valid} tok:${res.usage?.total_tokens} sess:${sessionId} -> ${res.choices[0].message.content?.slice(0, 25)}`);
      } catch (e: any) {
        fail++;
        const msg = e?.error?.message ?? e?.message ?? String(e);
        console.log(`#${n} [w${wid}] THROW ${Date.now() - t0}ms ${msg.slice(0, 120)}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i + 1)));
  console.log(`\nSummary Opencode: total=${TOTAL} ok=${ok} fail=${fail} tokens=${totalTokens} elapsed=${Date.now() - startAll}ms conc=${CONCURRENCY} timeout=${CALL_TIMEOUT_MS}ms`);
}

testOpencode20().catch(console.error);
