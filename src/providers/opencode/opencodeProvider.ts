import {
  ModelProbeResult,
  Model,
  opencodeConfig,
  AvailableOpencodeModel,
  BestModelResult,
} from "./opencodeConfig";
import { opencodeIdentity } from "./opencodeIdentity";

// TODO: buat function untuk meminta model spesifik. function akan ambil model dari state

export class OpencodeProvider {
  private static instance: OpencodeProvider | null = null;
  private static state: AvailableOpencodeModel = { availableModel: [] };
  private static probeTimer: ReturnType<typeof setInterval> | null = null;
  private static isProbing: boolean = false;

  private constructor() {}

  static getInstance() {
    if (!OpencodeProvider.instance) {
      OpencodeProvider.instance = new OpencodeProvider();
      OpencodeProvider.probeAvailableModelCron();
    }
    return OpencodeProvider.instance;
  }

  /**
   * Retrieves the best available model with the lowest latency.
   * Filters out unavailable models and picks the one with minimum latencyMs.
   */

  public static getBestModel(): BestModelResult | null {
    if (!OpencodeProvider.instance) {
      console.warn(
        "[getBestModel] Instance not initialized. Call getInstance() first.",
      );
      return null;
    }

    const state = OpencodeProvider.state;
    if (!state || !state.availableModel || state.availableModel.length === 0) {
      return null;
    }

    // Filter only available models
    const availableModels = state.availableModel.filter((m) => m.is_available);
    if (availableModels.length === 0) {
      return null;
    }

    // Find the model with the lowest latency
    const best = availableModels.reduce((prev, curr) =>
      curr.latencyMs < prev.latencyMs ? curr : prev,
    );

    return {
      model: best.model,
      latencyMs: best.latencyMs,
      checkedAt: best.checkedAt,
    };
  }


  private static probeAvailableModelCron(): void {
    // Clear any existing timer to avoid duplicate crons.
    if (OpencodeProvider.probeTimer) {
      clearInterval(OpencodeProvider.probeTimer);
    }

    // Run the initial probe immediately.
    OpencodeProvider.updateAvailableModelsState();

    // Schedule periodic probes.
    OpencodeProvider.probeTimer = setInterval(() => {
      OpencodeProvider.updateAvailableModelsState();
    }, opencodeConfig.modelProbeInterval);

    console.log(
      `[probeAvailableModelCron] Scheduled model probe every ${opencodeConfig.modelProbeInterval}ms`,
    );
  }


  private static async updateAvailableModelsState(): Promise<void> {
    if (OpencodeProvider.isProbing) {
      console.warn(
        "[updateAvailableModelsState] Previous probe still running, skipping.",
      );
      return;
    }

    OpencodeProvider.isProbing = true;

    try {
      const freeModels = await this.getFreeModelName();
      const checkedAt = new Date().toISOString();

      if (freeModels.length === 0) {
        console.warn(
          "No free models found. Marking all existing models as unavailable.",
        );
        const previousState = OpencodeProvider.state.availableModel;
        OpencodeProvider.state = {
          availableModel: previousState.map((prev) => ({
            ...prev,
            is_available: false,
            checkedAt,
          })),
        };
        return;
      }

      const probeResults: ModelProbeResult[] = await Promise.all(
        freeModels.map((model) => this.probeModel(model.modelName)),
      );

      const activeModelNames = new Set(freeModels.map((m) => m.modelName));
      const previousState = OpencodeProvider.state.availableModel;
      const missingProbeResults: ModelProbeResult[] = previousState
        .filter((prev) => !activeModelNames.has(prev.model))
        .map((prev) => ({
          model: prev.model,
          is_available: false,
          latencyMs: Infinity, // fix #4
          checkedAt,
        }));

      OpencodeProvider.state = {
        availableModel: [...probeResults, ...missingProbeResults],
      };
    } finally {
      // Selalu reset flag, bahkan kalau throw
      OpencodeProvider.isProbing = false;
    }
  }


  private static async probeModel(
    modelName: string,
  ): Promise<ModelProbeResult> {
    const checkedAt = new Date().toISOString();

    // AbortController + timer to enforce the request timeout from config.
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
          "x-opencode-session": identity.session,
          "x-opencode-request": identity.request,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: "user", content: "ping" }],
          max_tokens: 1,
        }),
      });

      const latencyMs = performance.now() - startTime;

      if (!res.ok) {
        return { model: modelName, is_available: false, latencyMs, checkedAt };
      }

      const data = await res.json();
      const is_available =
        Array.isArray(data.choices) && data.choices.length > 0;

      return { model: modelName, is_available, latencyMs, checkedAt };
    } catch {
      // Timeout / network error: record as unavailable, do not throw.
      return {
        model: modelName,
        is_available: false,
        latencyMs: performance.now() - startTime,
        checkedAt,
      };
    } finally {
      // Always clear the timer so the event loop does not leak.
      clearTimeout(timer);
    }
  }

  
  private static async getFreeModelName(): Promise<Model[]> {
    // AbortController + timer to enforce the request timeout from config.
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      opencodeConfig.requestTimeout,
    );

    try {
      const identity = opencodeIdentity.get();
      const res = await fetch(opencodeConfig.opencodeBaseUrl.availableModels, {
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${opencodeConfig.apiKey}`,

          // Identitas Klien & User Agent (Wajib untuk lolos validasi Zen)
          "User-Agent": "opencode/1.16.0",
          "x-opencode-client": "cli",
          "x-opencode-project": "global",
          "x-opencode-session": identity.session,
          "x-opencode-request": identity.request,
        },
      });

      if (!res.ok) {
        // fetch network error
        console.warn(
          `[getFreeModelName] Failed to fetch free model names: ${res.status} ${res.statusText}`,
        );
        return [];
      }

      const data = await res.json();

      // Keep only free models (id ending with "-free"), then normalize to Model.
      const freeModels: Model[] = data.data
        .filter((m: { id: string }) => m.id.endsWith("-free"))
        .map((m: { id: string }) => ({
          modelName: m.id,
        }));

      return freeModels;
    } catch (err) {
      // timeout / network / parsing error: log and do not throw.
      if (err instanceof Error && err.name === "AbortError") {
        console.warn(
          `[getFreeModelName] Fetch free available models timed out after ${opencodeConfig.requestTimeout}ms`,
        );
      } else {
        console.warn("[getFreeModelName] Unexpected error:", err);
      }
      return [];
    } finally {
      // Always clear the timer so the event loop does not leak.
      clearTimeout(timer);
    }
  }
}
