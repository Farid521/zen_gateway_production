import assert from "node:assert";

const urlCalls: string[] = [];
let nextResponse: () => Response;

globalThis.fetch = (async (url: any) => {
  urlCalls.push(String(url));
  return nextResponse();
}) as any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function main() {
  const { TavilyDriver } = await import("../src/driver/llm/tavily/tavilyDriver");
  const driver = new TavilyDriver();
  const session = { apiKey: "tvly-test", useCount: 0 } as any;

  // 1. search dengan hasil kosong -> sukses (dulu 502 code=UNKNOWN)
  nextResponse = () =>
    json({ query: "kuantum 2024", answer: null, images: [], results: [], response_time: 0.5, request_id: "r1" });
  const searchResult = await driver.search(session, { query: "kuantum 2024" } as any);
  assert.deepEqual(searchResult.results, []);
  assert.match(urlCalls.at(-1)!, /api\.tavily\.com\/search$/);

  // 2. crawl dengan hasil kosong -> sukses (halaman tanpa link)
  nextResponse = () =>
    json({ base_url: "https://example.com", results: [], response_time: 0.1, request_id: "r2" });
  const crawlResult = await driver.crawl(session, { url: "https://example.com" } as any);
  assert.deepEqual(crawlResult.results, []);

  // 3. extract dengan hasil kosong -> sukses
  nextResponse = () => json({ results: [], failed_results: [], response_time: 0.1 });
  const extractResult = await driver.extract(session, { urls: "https://example.com" } as any);
  assert.deepEqual(extractResult.results, []);

  // 4. 500 dari Tavily tetap dilempar sebagai INTERNAL_ERROR
  nextResponse = () => json({ detail: { error: "Internal server error" } }, 500);
  await assert.rejects(
    () => driver.search(session, { query: "x" } as any),
    (err: any) => err.code === "INTERNAL_ERROR" && err.httpStatus === 500,
  );

  // 5. 429 tetap dilempar sebagai RATE_LIMITED dan ditandai retryable
  nextResponse = () => json({ detail: { error: "Rate limit exceeded" } }, 429);
  await assert.rejects(
    () => driver.search(session, { query: "x" } as any),
    (err: any) => err.code === "RATE_LIMITED" && err.retryable === true,
  );

  console.log("OK: hasil kosong Tavily dianggap sukses, error asli tetap dilempar (5 skenario)");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
