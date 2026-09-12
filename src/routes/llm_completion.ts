import { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { AgentCompletionRequestType } from "../types/agent_types/agent_request";
import { AgentError, createAgentError } from "../types/agent_types/agent_error";
import { LlmCallAdapter } from "../driver/llm/llmCallDriver";
import { GeminiKeysPool } from "../providers/gemini/geminiProvider";
import type { GeminiModelId } from "../providers/gemini/geminiProviderConfig";

const LlmCompletionRequest = z.object({
  prompt: z.string().min(1),
  model: z.string().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().int().positive().optional(),
});

const adapter = new LlmCallAdapter();
const geminiPool = GeminiKeysPool.getInstance();

// ponytail: reuse mapping yang sama seperti agent_completion.ts
const GEMINI_IDS = new Set<GeminiModelId>([
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
]);
function resolveGeminiModel(m: string): GeminiModelId {
  return GEMINI_IDS.has(m as GeminiModelId)
    ? (m as GeminiModelId)
    : "gemini-3.1-flash-lite";
}

export const llm_completion: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = LlmCompletionRequest.safeParse(req.body);

  if (!parsed.success) {
    const error = createAgentError(
      `Invalid request: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ")}`,
      "invalid_request_error",
    );
    res.status(400).json(error.toResponse());
    return;
  }

  const modelIn = parsed.data.model ?? "gemini-3.1-flash-lite";
  const geminiModel = resolveGeminiModel(modelIn);
  const geminiSession = await geminiPool.reserveAsync(geminiModel, {
    timeoutMs: 500,
  });

  try {
    const agentReq: AgentCompletionRequestType = {
      model: modelIn,
      messages: [{ role: "user", content: parsed.data.prompt }],
      ...(parsed.data.temperature !== undefined ? { temperature: parsed.data.temperature } : {}),
      ...(parsed.data.top_p !== undefined ? { top_p: parsed.data.top_p } : {}),
      ...(parsed.data.max_tokens !== undefined ? { max_tokens: parsed.data.max_tokens } : {}),
    };
    const result = await adapter.callWithFallback(agentReq, geminiSession);
    res.json(result);
  } catch (err: any) {
    // thrown AgentError from adapter
    if (err instanceof AgentError) {
      const { error } = err;
      if (error.type === "service_unavailable" || error.code === "no_model_available") {
        res.status(503).json(err.toResponse());
        return;
      }
      if (error.type === "invalid_request_error") {
        res.status(400).json(err.toResponse());
        return;
      }
      res.status(502).json(err.toResponse());
      return;
    }
    next(err);
  }
};
