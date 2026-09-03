import express from "express";
import { agent_completion } from "./routes/agent_completion";
import { OpencodeProvider } from "./providers/opencode/opencodeProvider";
import { GeminiKeysPool } from "./providers/gemini/geminiProvider";

const app = express();
app.use(express.json({limit: "10mb"}));

OpencodeProvider.getInstance();
GeminiKeysPool.getInstance();

app.post("/v1/chat/completions", agent_completion);

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
