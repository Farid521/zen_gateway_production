import express, { Request, Response, NextFunction } from "express";
import { createAgentError } from "./types/agent_types/agent_error";
import { agent_completion } from "./routes/agent_completion";
import { llm_completion } from "./routes/llm_completion";
import { tavily_search, tavily_extract, tavily_crawl } from "./routes/tavily";
import { OpencodeProvider } from "./providers/opencode/opencodeProvider";
import { GeminiKeysPool } from "./providers/gemini/geminiProvider";
import { TavilyProvider } from "./providers/tavily/tavilyProvider";

const app = express();
app.use(express.json({limit: "10mb"}));

OpencodeProvider.getInstance();
GeminiKeysPool.getInstance();
TavilyProvider.getInstance();

app.post("/v1/chat/completions", agent_completion);
app.post("/llm", llm_completion);
app.post("/tavily/search", tavily_search);
app.post("/tavily/extract", tavily_extract);
app.post("/tavily/crawl", tavily_crawl);

// ponytail: error handler terakhir — body JSON rusak / payload kebesaran / error tak terduga.
// Tanpa ini Express membalas HTML, bukan envelope JSON yang sama seperti error lain.
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const isTooLarge = err?.type === "entity.too.large" || err?.status === 413;
  const isParse = err?.type === "entity.parse.failed";

  const status = isTooLarge ? 413 : isParse ? 400 : 500;
  const error = createAgentError(
    isTooLarge
      ? "Payload too large (limit 10mb)."
      : isParse
        ? "Invalid JSON body."
        : "Internal server error.",
    status === 500 ? "api_error" : "invalid_request_error",
    null,
    isTooLarge ? "payload_too_large" : isParse ? "invalid_json" : "internal_error",
  );

  res.status(status).json(error.toResponse());
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
