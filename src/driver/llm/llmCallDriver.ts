import { opencodeConfig } from "../../providers/opencode/opencodeConfig";
import { opencodeIdentity } from "../../providers/opencode/opencodeIdentity";
import { AgentCompletionRequestType } from "../../types/agent_types/agent_request";
import { AgentCompletionResponse } from "../../types/agent_types/agent_response";
import {
  AgentError,
  AgentErrorResponseSchema,
  createAgentError,
} from "../../types/agent_types/agent_error";
import { ReservedGeminiKey } from "../../providers/gemini/geminiProviderConfig";
import { deepseekConfig, resolveDeepseekModel } from "../../providers/deepseek/deepseekConfig";

// ponytail: quota = 429 / RESOURCE_EXHAUSTED saja, sinyal lain tetap provider_error
export function isQuotaError(status: number, errorBody: any, message: string): boolean {
  if (status === 429) return true;
  const code = errorBody?.code;
  const s = String(errorBody?.status ?? code ?? "");
  if (code === 429 || s === "429" || s === "RESOURCE_EXHAUSTED") return true;
  return /quota|rate.?limit|resource.?exhausted|exceeded/i.test(message ?? "");
}

export class LlmCallAdapter {
  constructor() {}

  async opencodeCallAdapter(
    model: string,
    request: AgentCompletionRequestType,
    sessionId?: string,
  ): Promise<AgentCompletionResponse> {
    const { fallback: _fallback, ...rest } = request;

    const body = JSON.stringify({
      ...rest,
      model,
    });

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opencodeConfig.requestTimeout,
    );

    const startTime = performance.now();

    try {
      const identity = opencodeIdentity.get();
      const res = await fetch(opencodeConfig.opencodeBaseUrl.chatCompletion, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${opencodeConfig.apiKey}`,
          "Content-Type": "application/json",
          "User-Agent": "opencode/1.16.0",
          "x-opencode-client": "cli",
          "x-opencode-project": "global",
          "x-opencode-session": sessionId || identity.session,
          "x-opencode-request": identity.request,
        },
        body,
      });

      if (!res.ok) {
        const raw = await res.text();
        let message = `Upstream request failed with status ${res.status} ${res.statusText}`;
        let code = "provider_error";
        let details: unknown;

        try {
          const parsed = AgentErrorResponseSchema.safeParse(JSON.parse(raw));
          if (parsed.success) {
            message = parsed.data.error.message;
            code = parsed.data.error.code ?? code;
            details = parsed.data.error.details;
          }
        } catch {
          // ignore JSON parse failure; fallback to generic message
        }

        throw createAgentError(message, "upstream_error", null, code, details);
      }

      const data = await res.json();
      const parsed = AgentCompletionResponse.safeParse(data);

      if (!parsed.success) {
        throw createAgentError(
          "Invalid upstream response structure.",
          "upstream_error",
          null,
          "invalid_upstream_response",
          { issues: parsed.error.issues },
        );
      }

      return parsed.data;
    } catch (err: any) {
      if (err instanceof AgentError) throw err;

      const latencyMs = performance.now() - startTime;
      if (err instanceof Error && err.name === "AbortError") {
        throw createAgentError(
          `Upstream request timed out after ${opencodeConfig.requestTimeout}ms`,
          "upstream_error",
          null,
          "provider_timeout",
          { latencyMs },
        );
      }
      throw createAgentError(
        err instanceof Error ? err.message : "Unknown upstream error",
        "upstream_error",
        null,
        "provider_error",
        { latencyMs },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async callGeminiAdapter(
    request: AgentCompletionRequestType,
    session: ReservedGeminiKey | null | undefined,
  ): Promise<AgentCompletionResponse> {
    if (!session) {
      throw createAgentError(
        "Gemini session is required but was null or undefined",
        "invalid_request_error",
        null,
        "missing_gemini_session",
      );
    }

    const {
      fallback: _fallback,
      frequency_penalty: _fp,
      presence_penalty: _pp,
      seed: _s,
      logprobs: _l,
      ...cleanRequest
    } = request as any;

    const payload = {
      ...cleanRequest,
      model: session.modelId,
      ...(request.n && request.n > 1 ? { n: 1 } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opencodeConfig.requestTimeout,
    );
    const startTime = performance.now();

    try {
      console.log(`[llm] serving via gemini model=${session.modelId}`);
      const res = await fetch(
        // this url is a special url for openai scheme to work in gemini
        "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
        {
          method: "POST",
          signal: controller.signal,
          headers: {
            Authorization: `Bearer ${session.apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      if (!res.ok) {
        // Parse upstream error payload, gracefully falling back on invalid JSON.
        const raw = await res.json().catch(() => null);
        let message = `Upstream request failed with status ${res.status} ${res.statusText}`;
        let code: string | null = "provider_error";
        let details: unknown;

        // Extract error details, normalizing Gemini's array-wrapped error format and OpenAI's object format.
        // Example raw[0] from Gemini: [{ error: { code: 400, message: "Invalid JSON payload...", status: "INVALID_ARGUMENT", details: [...] } }]
        const errorBody: any = Array.isArray(raw)
          ? raw[0]?.error
          : (raw as any)?.error;
        if (errorBody) {
          message = errorBody.message ?? message;
          code = String(errorBody.code ?? errorBody.status ?? code);
          details = errorBody.details ?? raw;
        } else if (raw) {
          details = raw;
        }

        session.release();
        // ponytail: bedakan kuota agar callWithFallback bisa fallback, tanpa retry/backoff
        if (isQuotaError(res.status, errorBody, message)) {
          throw createAgentError(message, "upstream_error", null, "quota_exhausted", details);
        }
        throw createAgentError(message, "upstream_error", null, code, details);
      }

      // Parse upstream success payload.
      const data = await res.json();

      // Record token usage if present, ignoring tracking failures.
      // Validate response against schema (Expected shape: { choices: [{ message: { content, tool_calls }, finish_reason }], usage: { total_tokens } })
      if (typeof data?.usage?.total_tokens === "number") {
        try {
          session.recordUsage(data.usage.total_tokens);
        } catch {
          console.warn("cannot record the token usage of gemini")
        }
      }
      // Release the reserved key back to the pool.
      session.release();

      const parsed = AgentCompletionResponse.safeParse(data);
      if (!parsed.success) {
        throw createAgentError(
          "Invalid upstream response structure.",
          "upstream_error",
          null,
          "invalid_upstream_response",
          { issues: parsed.error.issues },
        );
      }

      return parsed.data;
    } catch (err: any) {
      if (err instanceof AgentError) throw err;

      const latencyMs = performance.now() - startTime;
      try {
        session.release();
      } catch {}

      if (err instanceof Error && err.name === "AbortError") {
        throw createAgentError(
          `Upstream request timed out after ${opencodeConfig.requestTimeout}ms`,
          "upstream_error",
          null,
          "provider_timeout",
          { latencyMs },
        );
      }
      throw createAgentError(
        err instanceof Error ? err.message : "Unknown upstream error",
        "upstream_error",
        null,
        "provider_error",
        { latencyMs },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async callDeepseekAdapter(
    request: AgentCompletionRequestType,
    modelId?: string,
  ): Promise<AgentCompletionResponse> {
    if (!deepseekConfig.apiKey) {
      throw createAgentError(
        "DeepSeek API key is missing (DEEPSEEK_API_KEY)",
        "invalid_request_error",
        null,
        "missing_deepseek_key",
      );
    }

    const {
      fallback: _fallback,
      frequency_penalty: _fp,
      presence_penalty: _pp,
      seed: _s,
      logprobs: _l,
      ...cleanRequest
    } = request as any;

    const resolvedModel = resolveDeepseekModel(modelId ?? request.model);
    const payload = {
      ...cleanRequest,
      model: resolvedModel,
      // ponytail: thinking on (high) — reasoning di reasoning_content
      thinking: { type: "enabled" },
      reasoning_effort: "high",
      stream: false,
      ...(request.n && request.n > 1 ? { n: 1 } : {}),
    };

    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opencodeConfig.requestTimeout,
    );
    const startTime = performance.now();

    try {
      console.log(`[llm] serving via deepseek model=${resolvedModel}`);
      const res = await fetch(deepseekConfig.baseUrl, {
        method: "POST",
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${deepseekConfig.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const raw = await res.json().catch(() => null);
        let message = `Upstream request failed with status ${res.status} ${res.statusText}`;
        let code: string | null = "provider_error";
        let details: unknown;

        const errorBody: any = (raw as any)?.error;
        if (errorBody) {
          message = errorBody.message ?? message;
          code = String(errorBody.code ?? errorBody.type ?? code);
          details = raw;
        } else if (raw) {
          details = raw;
        }

        // ponytail: reuse isQuotaError (terverifikasi 24/24 lawan 429 asli)
        if (isQuotaError(res.status, errorBody, message)) {
          throw createAgentError(message, "upstream_error", null, "quota_exhausted", details);
        }
        throw createAgentError(message, "upstream_error", null, code, details);
      }

      const data = await res.json();
      const parsed = AgentCompletionResponse.safeParse(data);
      if (!parsed.success) {
        throw createAgentError(
          "Invalid upstream response structure.",
          "upstream_error",
          null,
          "invalid_upstream_response",
          { issues: parsed.error.issues },
        );
      }

      return parsed.data;
    } catch (err: any) {
      if (err instanceof AgentError) throw err;

      const latencyMs = performance.now() - startTime;
      if (err instanceof Error && err.name === "AbortError") {
        throw createAgentError(
          `Upstream request timed out after ${opencodeConfig.requestTimeout}ms`,
          "upstream_error",
          null,
          "provider_timeout",
          { latencyMs },
        );
      }
      throw createAgentError(
        err instanceof Error ? err.message : "Unknown upstream error",
        "upstream_error",
        null,
        "provider_error",
        { latencyMs },
      );
    } finally {
      clearTimeout(timer);
    }
  }

  async callWithFallback(
    request: AgentCompletionRequestType,
    geminiSession: ReservedGeminiKey | null | undefined,
    _opencodeSessionId?: string,
  ): Promise<AgentCompletionResponse> {
    // ponytail: error gemini apa pun -> deepseek, tanpa opencode
    const OK = "\x1b[32m[LLM:OK]\x1b[0m";
    const FAIL = "\x1b[33m[LLM:FALLBACK]\x1b[0m";
    if (!geminiSession) {
      const t0 = performance.now();
      const r = await this.callDeepseekAdapter(request);
      console.log(`${OK} provider=deepseek model=${r.model} latency=${Math.round(performance.now() - t0)}ms`);
      return r;
    }
    try {
      const t0 = performance.now();
      const r = await this.callGeminiAdapter(request, geminiSession);
      console.log(`${OK} provider=gemini model=${r.model} latency=${Math.round(performance.now() - t0)}ms`);
      return r;
    } catch (e: any) {
      console.log(`${FAIL} gemini=${geminiSession.modelId} err=${e?.message} -> deepseek`);
      const t0 = performance.now();
      const r = await this.callDeepseekAdapter(request);
      console.log(`${OK} provider=deepseek model=${r.model} latency=${Math.round(performance.now() - t0)}ms`);
      return r;
    }
  }
}
