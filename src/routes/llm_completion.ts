import { Request, Response, NextFunction, RequestHandler } from "express";
import { z } from "zod";
import { AgentCompletionRequestType } from "../types/agent_types/agent_request";
import { AgentError, createAgentError } from "../types/agent_types/agent_error";
import { LlmCompletionSchema } from "../types/llm_completion";
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

const SYSTEM_PROMPT = `You are a journal relevance classifier. Respond with ONLY a JSON object, no markdown, no explanation outside the JSON, with exactly these keys:
{"is_relevant": boolean, "has_basic_explanation": boolean, "has_basic_equations": boolean, "confidence": "high" | "medium" | "low", "reason": "max 150 characters, short reason", "journal_title": "journal title, or null if unknown", "apa_citation": "APA 7th edition citation, or null if metadata insufficient"}`;

// ponytail: content bisa string | array parts | null tergantung provider
function extractTextContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter((p: any) => p?.type === "text" && typeof p?.text === "string")
      .map((p: any) => p.text as string);
    return texts.length > 0 ? texts.join("") : null;
  }
  return null;
}

// ponytail: kupas ```json ... ``` kalau LLM masih membungkus
function stripCodeFence(s: string): string {
  const t = s.trim();
  const m = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return m ? m[1].trim() : t;
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
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: parsed.data.prompt },
      ],
      response_format: { type: "json_object" },
      // ponytail: default 0.2 biar structured output deterministik, tetap bisa di-override
      ...(parsed.data.temperature !== undefined
        ? { temperature: parsed.data.temperature }
        : { temperature: 0.2 }),
      ...(parsed.data.top_p !== undefined ? { top_p: parsed.data.top_p } : {}),
      ...(parsed.data.max_tokens !== undefined ? { max_tokens: parsed.data.max_tokens } : {}),
    };
    const result = await adapter.callWithFallback(agentReq, geminiSession);

    const raw = extractTextContent(result.choices[0]?.message?.content);
    if (!raw) {
      throw createAgentError(
        "Upstream returned empty content, expected JSON.",
        "upstream_error",
        null,
        "invalid_upstream_response",
      );
    }

    let json: unknown;
    try {
      json = JSON.parse(stripCodeFence(raw));
    } catch {
      throw createAgentError(
        "Upstream did not return valid JSON.",
        "upstream_error",
        null,
        "invalid_upstream_response",
        { raw: raw.slice(0, 2000) },
      );
    }

    const validated = LlmCompletionSchema.safeParse(json);
    if (!validated.success) {
      throw createAgentError(
        `Upstream JSON failed schema validation: ${validated.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ")}`,
        "upstream_error",
        null,
        "invalid_upstream_response",
        { issues: validated.error.issues, raw: JSON.stringify(json).slice(0, 2000) },
      );
    }

    res.json(validated.data);
  } catch (err: any) {
    // thrown AgentError from adapter / parse / validation
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
