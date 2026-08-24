import {
  ModelProbeResult,
  Model,
  opencodeConfig,
  AvailableOpencodeModel,
  BestModelResult,
} from "./opencodeConfig";
import { opencodeIdentity } from "./opencodeIdentity";


export class OpencodeProvider {
  private static instance: OpencodeProvider | null = null;
  private static state: AvailableOpencodeModel = { availableModel: [] };
  private static probeTimer: ReturnType<typeof setInterval> | null = null;
  private static isProbing: boolean = false;

  private constructor() {}

  /**
   * Returns the singleton instance, initializing the probe cycle on first call.
   */
  static getInstance() {
    if (!OpencodeProvider.instance) {
      OpencodeProvider.instance = new OpencodeProvider();
      OpencodeProvider.probeAvailableModelCron();
    }
    return OpencodeProvider.instance;
  }

  /**
   * Returns the lowest-latency model that is currently available.
   *
   * Returns null when the provider has not been initialized or
   * no model is currently available.
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

    const availableModels = state.availableModel.filter((m) => m.is_available);
    if (availableModels.length === 0) {
      return null;
    }

    const best = availableModels.reduce((prev, curr) =>
      curr.latencyMs < prev.latencyMs ? curr : prev,
    );

    return {
      model: best.model,
      latencyMs: best.latencyMs,
      checkedAt: best.checkedAt,
    };
  }


  /**
   * Schedules periodic probing of model availability.
   */
  private static probeAvailableModelCron(): void {
    // Reset the existing timer before scheduling a new probe cycle.
    if (OpencodeProvider.probeTimer) {
      clearInterval(OpencodeProvider.probeTimer);
    }

    OpencodeProvider.updateAvailableModelsState();

    OpencodeProvider.probeTimer = setInterval(() => {
      OpencodeProvider.updateAvailableModelsState();
    }, opencodeConfig.modelProbeInterval);

    console.log(
      `[probeAvailableModelCron] Scheduled model probe every ${opencodeConfig.modelProbeInterval}ms`,
    );
  }


  /**
   * Refreshes the cached model availability state.
   *
   * Skips the probe when a previous probe is still running.
   * Models that are no longer returned by the provider are kept in the
   * state but marked as unavailable.
   */
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
          latencyMs: Infinity,
          checkedAt,
        }));

      OpencodeProvider.state = {
        availableModel: [...probeResults, ...missingProbeResults],
      };
    } finally {
      // Reset the flag even when the probe throws.
      OpencodeProvider.isProbing = false;
    }
  }


  /**
   * Checks whether a model is usable and measures its response latency.
   */
  private static async probeModel(
    modelName: string,
  ): Promise<ModelProbeResult> {
    const checkedAt = new Date().toISOString();

    // Abort when the request exceeds the configured timeout.
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

          // Required by the OpenCode endpoint for client/session validation.
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
      clearTimeout(timer);
    }
  }

  /**
   * Fetches the list of free models from the provider.
   *
   * Returns an empty array on timeout, network failure, or non-OK response.
   */
  private static async getFreeModelName(): Promise<Model[]> {
    // Abort when the request exceeds the configured timeout.
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

          // Required by the OpenCode endpoint for client/session validation.
          "User-Agent": "opencode/1.16.0",
          "x-opencode-client": "cli",
          "x-opencode-project": "global",
          "x-opencode-session": identity.session,
          "x-opencode-request": identity.request,
        },
      });

      if (!res.ok) {
        console.warn(
          `[getFreeModelName] Failed to fetch free model names: ${res.status} ${res.statusText}`,
        );
        return [];
      }

      const data = await res.json();

      // Keep only free-tier models.
      const freeModels: Model[] = data.data
        .filter((m: { id: string }) => m.id.endsWith("-free"))
        .map((m: { id: string }) => ({
          modelName: m.id,
        }));

      return freeModels;
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        console.warn(
          `[getFreeModelName] Fetch free available models timed out after ${opencodeConfig.requestTimeout}ms`,
        );
      } else {
        console.warn("[getFreeModelName] Unexpected error:", err);
      }
      return [];
    } finally {
      clearTimeout(timer);
    }
  }
}
