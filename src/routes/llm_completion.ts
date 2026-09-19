import { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { AgentCompletionRequestType } from "../types/agent_types/agent_request";
import { createAgentError } from "../types/agent_types/agent_error";
import { LlmCallAdapter, extractTextContent } from "../driver/llm/llmCallDriver";
import { sendAgentError } from "./send_agent_error";
import { GeminiKeysPool } from "../providers/gemini/geminiProvider";
import type { GeminiModelId } from "../providers/gemini/geminiProviderConfig";

/**
 * GENERAL /llm endpoint.
 *
 * Generic, requirement-agnostic LLM passthrough — no default system prompt,
 * no response schema validation. The caller controls the full conversation:
 *
 *   { prompt: "..." }                              -> single user turn
 *   { prompt, system: "..." }                       -> system + user turn
 *   { messages: [{ role, content }, ...] }          -> full conversation
 *
 * Optional knobs: model, temperature, top_p, max_tokens, json_mode.
 * When json_mode=true the model is asked (not forced) to output strict JSON;
 * the gateway still does NOT validate the shape — that is the caller's job.
 */

const LlmCompletionRequest = z
  .object({
    prompt: z.string().min(1).optional(),
    system: z.string().optional(),
    messages: z
      .array(
        z.object({
          role: z.enum(["system", "user", "assistant"]),
          content: z.string().min(1),
        })
      )
      .optional(),
    model: z.string().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    json_mode: z.boolean().optional(),
  })
  .refine((data) => data.prompt !== undefined || data.messages !== undefined, {
    message: 'either "prompt" or "messages" is required',
  });

const adapter = new LlmCallAdapter();
const geminiPool = GeminiKeysPool.getInstance();

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

  const data = parsed.data;
  const modelIn = data.model ?? "gemini-3.1-flash-lite";
  const geminiModel = resolveGeminiModel(modelIn);
  const geminiSession = await geminiPool.reserveAsync(geminiModel, {
    timeoutMs: 500,
  });

  try {
    // Build the conversation directly from the caller's input.
    // No default system prompt is injected here.
    const messages: Array<{ role: string; content: string }> = [];
    if (data.messages && data.messages.length > 0) {
      messages.push(...data.messages);
    } else {
      if (data.system) messages.push({ role: "system", content: data.system });
      messages.push({ role: "user", content: data.prompt as string });
    }
    if (data.json_mode) {
      messages.push({
        role: "system",
        content:
          "Respond with ONLY a valid JSON object. No markdown, no code fences, no explanation outside the JSON.",
      });
    }

    const agentReq: AgentCompletionRequestType = {
      model: modelIn,
      messages,
      ...(data.json_mode ? { response_format: { type: "json_object" } } : {}),
      ...(data.temperature !== undefined
        ? { temperature: data.temperature }
        : { temperature: 0.2 }),
      ...(data.top_p !== undefined ? { top_p: data.top_p } : {}),
      ...(data.max_tokens !== undefined ? { max_tokens: data.max_tokens } : {}),
    } as AgentCompletionRequestType;

    const result = await adapter.callWithFallback(agentReq, geminiSession);

    // ponytail: cek "jawaban kosong" sekarang ada di driver (callWithFallback)
    // supaya kasus itu ikut fallback ke DeepSeek, bukan langsung gagal
    const raw = extractTextContent(result.choices[0]?.message?.content) ?? "";

    // General endpoint: return the model text as-is (no schema validation).
    res.json({
      content: raw,
      model: result.model ?? modelIn,
      usage: result.usage ?? null,
    });
  } catch (err: any) {
    if (sendAgentError(res, err)) return;
    next(err);
  }
};
