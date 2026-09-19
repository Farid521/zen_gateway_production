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

export type UpstreamErrorKind = "quota" | "transient" | "bad_request" | "auth" | "unknown";

/**
 * Menentukan jenis error upstream dari respons non-2xx.
 * 429/kuota diperiksa lebih dulu supaya tetap punya kode sendiri.
 */
export function classifyUpstreamError(
  status: number,
  errorBody: any,
  message: string,
): UpstreamErrorKind {
  // ponytail: status 5xx adalah sinyal paling kuat (mis. "Deadline exceeded" jangan sampai
  // terbaca sebagai kuota hanya karena kata "exceeded")
  if (status >= 500) return "transient";

  if (isQuotaError(status, errorBody, message)) return "quota";

  const statusText = String(errorBody?.status ?? errorBody?.type ?? "").toUpperCase();
  const TRANSIENT_STATUS = new Set([
    "UNAVAILABLE",
    "INTERNAL",
    "DEADLINE_EXCEEDED",
    "ABORTED",
    "UNKNOWN",
  ]);
  // ponytail: menangkap 503 "This model is currently experiencing high demand..."
  const TRANSIENT_MESSAGE = /high demand|overload|temporarily|unavailable|try again|timeout|deadline/i;

  if (TRANSIENT_STATUS.has(statusText) || TRANSIENT_MESSAGE.test(message ?? "")) {
    return "transient";
  }
  if (status === 401 || status === 403) return "auth";
  if (status >= 400) return "bad_request";
  return "unknown";
}

// ponytail: content bisa string | array parts | null tergantung provider
export function extractTextContent(content: unknown): string | null {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    const texts = content
      .filter((p: any) => p?.type === "text" && typeof p?.text === "string")
      .map((p: any) => p.text as string);
    return texts.length > 0 ? texts.join("") : null;
  }
  return null;
}

/**
 * Jawaban dianggap sah kalau ada teks, ada tool_calls (flow agent), atau ada reasoning_content.
 * Selain itu jawaban dianggap gagal supaya ikut fallback.
 */
export function hasUsableOutput(response: AgentCompletionResponse): boolean {
  const message: any = response.choices?.[0]?.message;
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length > 0) return true;
  if (typeof message?.reasoning_content === "string" && message.reasoning_content.trim().length > 0) {
    return true;
  }
  const text = extractTextContent(message?.content);
  return typeof text === "string" && text.trim().length > 0;
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

    const payload: any = {
      ...cleanRequest,
      model: session.modelId,
      ...(request.n && request.n > 1 ? { n: 1 } : {}),
    };

    // ponytail: inject dummy thought_signature untuk histori synthetic/transfer (Gemini 3 wajib)
    if (Array.isArray(payload.tools) && payload.tools.length > 0 && Array.isArray(payload.messages)) {
      payload.messages = payload.messages.map((m: any) => {
        if (m.role !== "assistant" || !Array.isArray(m.tool_calls)) return m;
        return {
          ...m,
          tool_calls: m.tool_calls.map((tc: any) => {
            if (tc?.extra_content?.google?.thought_signature) return tc;
            return { ...tc, extra_content: { ...(tc.extra_content || {}), google: { ...(tc.extra_content?.google || {}), thought_signature: "skip_thought_signature_validator" } } };
          }),
        };
      });
    }

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
        // ponytail: klasifikasi error dulu, lalu beri `code` yang bisa dibaca callWithFallback
        const kind = classifyUpstreamError(res.status, errorBody, message);
        const upstreamDetails = {
          upstreamStatus: res.status,
          upstreamStatusText: errorBody?.status ?? null,
          upstream: details ?? raw,
        };

        if (kind === "transient") {
          // 5xx / "high demand": gangguan sementara, provider lain masih bisa melayani
          throw createAgentError(message, "upstream_error", null, "provider_unavailable", upstreamDetails);
        }
        if (kind === "quota") {
          throw createAgentError(message, "upstream_error", null, "quota_exhausted", upstreamDetails);
        }
        if (kind === "bad_request") {
          // 400 belum jelas salah siapa: dicoba dulu ke DeepSeek di callWithFallback
          throw createAgentError(message, "invalid_request_error", null, "upstream_bad_request", upstreamDetails);
        }
        if (kind === "auth") {
          // 401/403: kredensial kita yang bermasalah, bukan request pengguna
          throw createAgentError(message, "upstream_error", null, "upstream_auth_error", upstreamDetails);
        }
        throw createAgentError(message, "upstream_error", null, code, upstreamDetails);
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
        // ponytail: log detail agar invalid_upstream_response mudah di-debug di Render
        console.error(`[ERROR][Gemini] invalid_upstream_response issues=${JSON.stringify(parsed.error.issues).slice(0,800)} raw=${JSON.stringify(data).slice(0,1000)}`);
        throw createAgentError(
          "Invalid upstream response structure.",
          "upstream_error",
          null,
          "invalid_upstream_response",
          { issues: parsed.error.issues, raw: JSON.stringify(data).slice(0,2000) },
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
        // ponytail: salah konfigurasi server, bukan salah pengguna -> 503 bukan 400
        "service_unavailable",
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
    // ponytail: thinking off saat tools ada — cegah 400 reasoning_content must be passed back + hemat token
    const hasTools = Array.isArray(request.tools) && request.tools.length > 0;
    const payload = {
      ...cleanRequest,
      model: resolvedModel,
      ...(hasTools ? { thinking: { type: "disabled" } } : { thinking: { type: "enabled" }, reasoning_effort: "high" }),
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

        // ponytail: kode error disamakan dengan jalur Gemini supaya callWithFallback konsisten
        const kind = classifyUpstreamError(res.status, errorBody, message);
        const upstreamDetails = {
          upstreamStatus: res.status,
          upstreamStatusText: errorBody?.status ?? errorBody?.type ?? null,
          upstream: details ?? raw,
        };

        if (kind === "quota") {
          throw createAgentError(message, "upstream_error", null, "quota_exhausted", upstreamDetails);
        }
        if (kind === "bad_request") {
          throw createAgentError(message, "invalid_request_error", null, "upstream_bad_request", upstreamDetails);
        }
        if (kind === "auth") {
          throw createAgentError(message, "upstream_error", null, "upstream_auth_error", upstreamDetails);
        }
        if (kind === "transient") {
          throw createAgentError(message, "upstream_error", null, "provider_unavailable", upstreamDetails);
        }
        throw createAgentError(message, "upstream_error", null, code, upstreamDetails);
      }

      const data = await res.json();
      const parsed = AgentCompletionResponse.safeParse(data);
      if (!parsed.success) {
        console.error(`[ERROR][DeepSeek] invalid_upstream_response issues=${JSON.stringify(parsed.error.issues).slice(0,800)} raw=${JSON.stringify(data).slice(0,1000)}`);
        throw createAgentError(
          "Invalid upstream response structure.",
          "upstream_error",
          null,
          "invalid_upstream_response",
          { issues: parsed.error.issues, raw: JSON.stringify(data).slice(0,2000) },
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
    // ponytail: request yang sudah lolos validasi route selalu dicoba ke deepseek kalau gemini gagal.
    // yang tidak ditolak di route = bukan salah pengguna, jadi provider lain perlu dicoba.
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
      // ponytail: jawaban kosong dianggap gagal supaya ikut fallback, bukan dikirim apa adanya
      if (!hasUsableOutput(r)) {
        throw createAgentError(
          "Upstream returned empty content.",
          "upstream_error",
          null,
          "invalid_upstream_response",
        );
      }
      console.log(`${OK} provider=gemini model=${r.model} latency=${Math.round(performance.now() - t0)}ms`);
      return r;
    } catch (e: any) {
      const geminiError: AgentError = e instanceof AgentError
        ? e
        : createAgentError(
            e?.message ?? "Unknown upstream error",
            "upstream_error",
            null,
            "provider_error",
          );
      const upstreamStatus = (geminiError.error.details as any)?.upstreamStatus ?? "-";
      console.log(
        `${FAIL} gemini=${geminiSession.modelId} code=${geminiError.error.code} status=${upstreamStatus} err=${geminiError.message} -> deepseek`,
      );

      try {
        const t0 = performance.now();
        const r = await this.callDeepseekAdapter(request);
        if (!hasUsableOutput(r)) {
          throw createAgentError(
            "Upstream returned empty content.",
            "upstream_error",
            null,
            "invalid_upstream_response",
          );
        }
        console.log(`${OK} provider=deepseek model=${r.model} latency=${Math.round(performance.now() - t0)}ms`);
        return r;
      } catch (dsErr: any) {
        // ponytail: dua provider sama-sama menolak 400 -> request-nya memang salah pengguna,
        // jadi pakai pesan Gemini (provider utama) supaya pesannya tetap relevan
        if (dsErr instanceof AgentError && dsErr.error.code === "upstream_bad_request") {
          throw geminiError.error.code === "upstream_bad_request" ? geminiError : dsErr;
        }
        throw dsErr;
      }
    }
  }
}
