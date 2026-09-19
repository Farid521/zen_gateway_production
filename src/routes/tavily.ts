import type { RequestHandler } from "express";
import { TavilyProvider } from "../providers/tavily/tavilyProvider";
import { TavilyDriver } from "../driver/llm/tavily/tavilyDriver";
import { TavilySearchRequestSchema } from "../types/tavily/search";
import { TavilyExtractRequestSchema } from "../types/tavily/extract";
import { TavilyCrawlRequestSchema } from "../types/tavily/crawl";
import { TavilyError, type TavilyEndpoint, type TavilyErrorCode } from "../types/tavily/error";

const provider = TavilyProvider.getInstance();
const driver = new TavilyDriver();

// ponytail: single map, tambah case hanya jika Tavily menambah kode baru
function statusFor(code: TavilyErrorCode): number {
  switch (code) {
    case "INVALID_REQUEST": return 400;
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "RATE_LIMITED": return 429;
    case "QUOTA_EXCEEDED": return 503;
    case "TIMEOUT": return 504;
    default: return 502;
  }
}

function sendTavilyError(res: any, err: TavilyError) {
  res.status(statusFor(err.code)).json({
    error: { message: err.message, code: err.code, endpoint: err.endpoint, retryable: err.retryable, hint: err.hint },
  });
}

function noKey(res: any, endpoint: TavilyEndpoint) {
  console.error(`[ERROR][Tavily] at noKey src/routes/tavily.ts endpoint=${endpoint} code=QUOTA_EXCEEDED msg=no tavily api key available, all keys exhausted`);
  res.status(503).json({
    error: { message: "no tavily api key available, all keys exhausted", code: "QUOTA_EXCEEDED", endpoint, retryable: false },
  });
}

function toUpstreamSearchBody(data: any): any {
  const { tahun, tahun_from, tahun_to, ...rest } = data;
  const body: any = { ...rest };
  if (tahun !== undefined) {
    body.start_date = `${tahun}-01-01`;
    body.end_date = `${tahun}-12-31`;
  } else {
    if (tahun_from !== undefined) body.start_date = `${tahun_from}-01-01`;
    if (tahun_to !== undefined) body.end_date = `${tahun_to}-12-31`;
  }
  return body;
}

export const tavily_search: RequestHandler = async (req, res, next) => {
  const parsed = TavilySearchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    console.error(`[ERROR][Validation] at tavily_search src/routes/tavily.ts endpoint=search msg=${msg.slice(0, 200)}`);
    res.status(400).json({ error: { message: msg, code: "INVALID_REQUEST", endpoint: "search", retryable: false } });
    return;
  }
  const session = provider.getApiKey();
  if (!session.apiKey) { noKey(res, "search"); return; }
  try {
    const upstreamBody = toUpstreamSearchBody(parsed.data);
    res.json(await driver.search(session, upstreamBody));
  } catch (err: any) {
    if (err instanceof TavilyError) { sendTavilyError(res, err); return; }
    next(err);
  }
};

export const tavily_extract: RequestHandler = async (req, res, next) => {
  const parsed = TavilyExtractRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    console.error(`[ERROR][Validation] at tavily_extract src/routes/tavily.ts endpoint=extract msg=${msg.slice(0, 200)}`);
    res.status(400).json({ error: { message: msg, code: "INVALID_REQUEST", endpoint: "extract", retryable: false } });
    return;
  }
  const session = provider.getApiKey();
  if (!session.apiKey) { noKey(res, "extract"); return; }
  try {
    res.json(await driver.extract(session, parsed.data));
  } catch (err: any) {
    if (err instanceof TavilyError) { sendTavilyError(res, err); return; }
    next(err);
  }
};

export const tavily_crawl: RequestHandler = async (req, res, next) => {
  const parsed = TavilyCrawlRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    const msg = parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ");
    console.error(`[ERROR][Validation] at tavily_crawl src/routes/tavily.ts endpoint=crawl msg=${msg.slice(0, 200)}`);
    res.status(400).json({ error: { message: msg, code: "INVALID_REQUEST", endpoint: "crawl", retryable: false } });
    return;
  }
  const session = provider.getApiKey();
  if (!session.apiKey) { noKey(res, "crawl"); return; }
  try {
    res.json(await driver.crawl(session, parsed.data));
  } catch (err: any) {
    if (err instanceof TavilyError) { sendTavilyError(res, err); return; }
    next(err);
  }
};
