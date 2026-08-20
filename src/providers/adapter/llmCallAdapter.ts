import { opencodeConfig } from "../opencode/opencodeConfig";
import { opencodeIdentity } from "../opencode/opencodeIdentity";
import { AgentCompletionRequestType } from "../../types/agent_types/agent_request";
import { AgentCompletionResponse } from "../../types/agent_types/agent_response";
import {
  AgentErrorResponseSchema,
  createAgentErrorResponse,
  AgentErrorResponse,
} from "../../types/agent_types/agent_error";

export class LlmCallAdapter {
  constructor() {}

  async opencodeCallAdapter(
    model: string,
    request: AgentCompletionRequestType,
    sessionId?: string,
  ): Promise<AgentCompletionResponse | AgentErrorResponse> {
    // opencode does not support fallback field
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

          // Identitas Klien & User Agent (Wajib untuk lolos validasi Zen)
          "User-Agent": "opencode/1.16.0",
          "x-opencode-client": "cli",
          "x-opencode-project": "global",
          "x-opencode-session": sessionId || identity.session,
          "x-opencode-request": identity.request,
        },
        body,
      });

      const latencyMs = performance.now() - startTime;

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

        return createAgentErrorResponse(
          message,
          "upstream_error",
          null,
          code,
          details,
        );
      }

      const data = await res.json();
      const parsed = AgentCompletionResponse.safeParse(data);

      if (!parsed.success) {
        return createAgentErrorResponse(
          "Invalid upstream response structure.",
          "upstream_error",
          null,
          "invalid_upstream_response",
          { issues: parsed.error.issues },
        );
      }

      return parsed.data;
    } catch (err) {
      const latencyMs = performance.now() - startTime;
      if (err instanceof Error && err.name === "AbortError") {
        return createAgentErrorResponse(
          `Upstream request timed out after ${opencodeConfig.requestTimeout}ms`,
          "upstream_error",
          null,
          "provider_timeout",
          { latencyMs },
        );
      }
      return createAgentErrorResponse(
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
}

// verifikasi bentuk request openhands-sdk. [AMAN]
// verifikasi juga bentuk respon yang bisa diterima. [AMAN] error skema juga aman [AMAN]
// 
// verifikasi request yang bisa diterima oleh opencode [AMAN]
// verifikasi juga bentuk respon yang dikirim oleh opencode [AMAN]
//
// verifikasi request yang bisa diterima gemini [AMAN]
// verifikasi juga bentuk respon yang dikirim oleh gemini [AMAN]
//
// buat single openAi request manager []