import {
  createGeminiConfig,
  GeminiConfig,
  GeminiKey,
  GeminiModel,
  GeminiModelConfig,
  GeminiModelId,
  GeminiModelState,
  ReservedGeminiKey,
  ReserveWaitOptions,
} from "./geminiProviderConfig";

// Sliding window for RPM/TPM checks.
const WINDOW_MS = 60_000;
// Daily window for RPD checks.
const DAY_MS = 24 * 60 * 60 * 1000;

export class GeminiKeysPool {
  private static instance: GeminiKeysPool | null = null;
  private static seq = 0;

  private readonly geminiKeys: GeminiKey[];
  private nextKeyIndex = 0;

  /**
   * Creates per-key model states from the given config.
   */
  private static createGeminiKeys(config: GeminiConfig): GeminiKey[] {
    const now = Date.now();
    return config.keys.map((apiKey, index) => {
      const models = {} as Record<GeminiModelId, GeminiModel>;
      for (const [modelId, modelConfig] of Object.entries(config.models) as [
        GeminiModelId,
        GeminiModelConfig,
      ][]) {
        models[modelId] = {
          id: modelId,
          rpm: modelConfig.rpm,
          tpm: modelConfig.tpm,
          rpd: modelConfig.rpd,
          state: {
            reservationId: null,
            requestTimestamps: [],
            tokenUsages: [],
            dailyRequestCount: 0,
            dailyResetAt: now + DAY_MS,
          },
        };
      }
      return { id: `gemini-key-${index + 1}`, apiKey, models };
    });
  }

  private constructor(config: GeminiConfig = createGeminiConfig()) {
    this.geminiKeys = GeminiKeysPool.createGeminiKeys(config);
  }

  /**
   * Initializes the singleton with the given config.
   *
   * Throws when the pool has already been initialized.
   */
  static initialize(
    config: GeminiConfig = createGeminiConfig(),
  ): GeminiKeysPool {
    if (GeminiKeysPool.instance !== null)
      throw new Error("GeminiKeysPool has already been initialized.");
    GeminiKeysPool.instance = new GeminiKeysPool(config);
    return GeminiKeysPool.instance;
  }

  /**
   * Returns the singleton instance, creating it from environment when not yet initialized.
   */
  static getInstance(): GeminiKeysPool {
    if (GeminiKeysPool.instance === null)
      GeminiKeysPool.instance = new GeminiKeysPool(createGeminiConfig());
    return GeminiKeysPool.instance;
  }

  /**
   * Resets the singleton. Test helper only.
   */
  static _resetForTest(): void {
    GeminiKeysPool.instance = null;
  }

  /**
   * Removes entries outside the current sliding window.
   */
  private cleanupSlidingWindow(state: GeminiModelState, now: number): void {
    const windowStart = now - WINDOW_MS;
    state.requestTimestamps = state.requestTimestamps.filter(
      (t) => t > windowStart,
    );
    state.tokenUsages = state.tokenUsages.filter(
      (u) => u.timestamp > windowStart,
    );
  }

  /**
   * Resets the daily request count when the daily window has elapsed.
   */
  private resetDailyCountIfNeeded(state: GeminiModelState, now: number): void {
    if (now < state.dailyResetAt) return;
    state.dailyRequestCount = 0;
    state.dailyResetAt = now + DAY_MS;
  }

  /**
   * Reserves an available key for the given model.
   *
   * Checks RPM, TPM, and RPD limits within the sliding and daily windows.
   * Uses round-robin across keys and skips keys that are currently reserved.
   * Returns null when no key is available.
   */
  reserve(modelId: GeminiModelId): ReservedGeminiKey | null {
    const now = Date.now();
    const totalKeys = this.geminiKeys.length;
    if (totalKeys === 0) return null;

    for (let offset = 0; offset < totalKeys; offset++) {
      const index = (this.nextKeyIndex + offset) % totalKeys;
      const key = this.geminiKeys[index];
      const model = key.models[modelId];
      if (!model) continue;

      const state = model.state;
      // Remove expired entries before checking limits.
      this.cleanupSlidingWindow(state, now);
      this.resetDailyCountIfNeeded(state, now);

      // Skip keys that are reserved or have exceeded quota.
      if (state.reservationId !== null) continue;
      if (state.requestTimestamps.length >= model.rpm) continue;

      const tokensInWindow = state.tokenUsages.reduce(
        (total, u) => total + u.tokens,
        0,
      );
      if (tokensInWindow >= model.tpm) continue;
      if (state.dailyRequestCount >= model.rpd) continue;

      const reservationId = `r-${++GeminiKeysPool.seq}-${Date.now()}`;
      state.reservationId = reservationId;
      this.nextKeyIndex = (index + 1) % totalKeys;
      let released = false;

      return {
        reservationId,
        keyId: key.id,
        modelId,
        apiKey: key.apiKey,
        rpm: model.rpm,
        tpm: model.tpm,
        rpd: model.rpd,
        recordUsage(tokens: number) {
          // Prevent recording after release.
          if (released) throw new Error("Cannot record usage after release.");
          if (!Number.isFinite(tokens) || tokens < 0)
            throw new Error(`Invalid token usage: ${tokens}`);
          const ts = Date.now();
          state.requestTimestamps.push(ts);
          state.tokenUsages.push({ timestamp: ts, tokens });
          state.dailyRequestCount++;
        },
        release() {
          if (released) return;
          released = true;
          // Ensure only the owning reservation clears the state.
          if (state.reservationId === reservationId) state.reservationId = null;
        },
      };
    }
    return null;
  }

  /**
   * Reserves a key, waiting until one becomes available.
   *
   * Polls via reserve() with a short delay.
   * Returns null when the timeout expires or the signal is aborted.
   */
  async reserveAsync(
    modelId: GeminiModelId,
    options: ReserveWaitOptions = {},
  ): Promise<ReservedGeminiKey | null> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (options.signal?.aborted) return null;

      const reserved = this.reserve(modelId);
      if (reserved !== null) return reserved;

      const remaining = deadline - Date.now();
      if (remaining <= 0) return null;

      const delay = Math.min(50, remaining);

      await new Promise<void>((resolve) => {
        const onAbort = () => {
          clearTimeout(t);
          resolve();
        };

        const t = setTimeout(() => {
          options.signal?.removeEventListener("abort", onAbort); // cleanup sebelum resolve
          resolve();
        }, delay);

        options.signal?.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
}
