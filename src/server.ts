import express from "express";
import { agent_completion } from "./routes/agent_completion";
import { OpencodeProvider } from "./providers/opencode/opencodeProvider";

const app = express();
app.use(express.json());

OpencodeProvider.getInstance();

app.post("/agent/chat/completions", agent_completion);
app.post("/v1/chat/completions", agent_completion);
app.post("/chat/completions", agent_completion);

app.post("/test/chat/completions", (req, res) => {
    console.log("hit")
    console.log(JSON.stringify(req.body, null, 2));
  res.json({
    message: "Server is running",
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});
