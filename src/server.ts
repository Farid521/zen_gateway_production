import express from "express";
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

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
