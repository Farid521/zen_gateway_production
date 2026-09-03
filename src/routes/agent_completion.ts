import { Request, Response, NextFunction, RequestHandler } from "express";
import { AgentCompletionRequest } from "../types/agent_types/agent_request";
import { AgentError, createAgentError } from "../types/agent_types/agent_error";
import { LlmCallAdapter } from "../driver/llm/llmCallDriver";
import { GeminiKeysPool } from "../providers/gemini/geminiProvider";
import type { GeminiModelId } from "../providers/gemini/geminiProviderConfig";

const adapter = new LlmCallAdapter();
const geminiPool = GeminiKeysPool.getInstance();

// ponytail: opsi A — map request.model -> Gemini id, default 3.1-flash-lite
const GEMINI_IDS = new Set<GeminiModelId>([
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash-lite",
]);
function resolveGeminiModel(m: string): GeminiModelId {
  return GEMINI_IDS.has(m as GeminiModelId)
    ? (m as GeminiModelId)
    : "gemini-3.1-flash-lite";
}

export const agent_completion: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = AgentCompletionRequest.safeParse(req.body);

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

  // ponytail: reserveAsync 500ms — cukup tunggu key free sebentar, lalu fallback ke opencode via callWithFallback (cegah hang)
  const geminiModel = resolveGeminiModel(parsed.data.model);
  const geminiSession = await geminiPool.reserveAsync(geminiModel, {
    timeoutMs: 500,
  });

  try {
    const result = await adapter.callWithFallback(parsed.data, geminiSession);
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
