import crypto from "node:crypto";
import { EventEmitter } from "node:events";

import { GeminiConfig, GeminiModelConfig, GeminiModelId } from "./config";

const WINDOW_MS = 60_000;
const DAY_MS = 24 * 60 * 60 * 1000;

/* =========================================================
 * INTERNAL STATE
 * ========================================================= */

interface GeminiModelState {
  reservationId: string | null;

  requestTimestamps: number[];

  tokenUsages: {
    timestamp: number;
    tokens: number;
  }[];

  dailyRequestCount: number;

  dailyResetAt: number;
}

interface GeminiModel {
  id: GeminiModelId;

  rpm: number;
  tpm: number;
  rpd: number;

  state: GeminiModelState;
}

interface GeminiKey {
  id: string;
  apiKey: string;

  models: Record<GeminiModelId, GeminiModel>;
}

/* =========================================================
 * RESERVED KEY
 * ========================================================= */

export interface ReservedGeminiKey {
  readonly reservationId: string;

  readonly keyId: string;
  readonly modelId: GeminiModelId;
  readonly apiKey: string;

  readonly rpm: number;
  readonly tpm: number;
  readonly rpd: number;

  release(): void;

  recordUsage(tokens: number): void;
}

export interface ReserveWaitOptions {
  /** Berapa lama boleh menunggu sebelum menyerah dan return null. Default 30 detik. */
  timeoutMs?: number;
  /** Optional AbortSignal supaya caller bisa membatalkan tunggu lebih awal. */
  signal?: AbortSignal;
}

/* =========================================================
 * FACTORY
 * ========================================================= */

function createGeminiModel(
  modelId: GeminiModelId,
  config: GeminiModelConfig,
): GeminiModel {
  const now = Date.now();

  return {
    id: modelId,

    rpm: config.rpm,
    tpm: config.tpm,
    rpd: config.rpd,

    state: {
      reservationId: null,
      requestTimestamps: [],
      tokenUsages: [],
      dailyRequestCount: 0,
      dailyResetAt: now + DAY_MS,
    },
  };
}

export function createGeminiKeys(config: GeminiConfig): GeminiKey[] {
  return config.keys.map((apiKey, index) => {
    const models = {} as Record<GeminiModelId, GeminiModel>;

    for (const [modelId, modelConfig] of Object.entries(config.models) as [
      GeminiModelId,
      GeminiModelConfig,
    ][]) {
      models[modelId] = createGeminiModel(modelId, modelConfig);
    }

    return {
      id: `gemini-key-${index + 1}`,
      apiKey,
      models,
    };
  });
}

/* =========================================================
 * SINGLETON
 * ========================================================= */

export class GeminiKeysPool {
  private static instance: GeminiKeysPool | null = null;

  private readonly geminiKeys: GeminiKey[];

  private nextKeyIndex = 0;

  // Event bus internal: dipakai buat "membangunkan" thread yang lagi nunggu
  // slot begitu ada reservation yang di-release, tanpa harus nunggu window RPM habis.
  private readonly slotEvents = new EventEmitter();

  private constructor(config: GeminiConfig) {
    this.geminiKeys = createGeminiKeys(config);
    // Banyak thread bisa nunggu bersamaan di model yang sama.
    this.slotEvents.setMaxListeners(0);
  }

  /* =======================================================
   * INITIALIZE
   * ======================================================= */

  static initialize(config: GeminiConfig): GeminiKeysPool {
    if (GeminiKeysPool.instance !== null) {
      throw new Error("GeminiKeysPool has already been initialized.");
    }

    GeminiKeysPool.instance = new GeminiKeysPool(config);

    return GeminiKeysPool.instance;
  }

  /* =======================================================
   * GET INSTANCE
   * ======================================================= */

  static getInstance(): GeminiKeysPool {
    if (GeminiKeysPool.instance === null) {
      throw new Error("GeminiKeysPool has not been initialized.");
    }

    return GeminiKeysPool.instance;
  }

  /* =======================================================
   * CLEANUP
   * ======================================================= */

  private cleanupSlidingWindow(state: GeminiModelState, now: number): void {
    const windowStart = now - WINDOW_MS;

    state.requestTimestamps = state.requestTimestamps.filter(
      (timestamp) => timestamp > windowStart,
    );

    state.tokenUsages = state.tokenUsages.filter(
      (usage) => usage.timestamp > windowStart,
    );
  }

  /* =======================================================
   * DAILY RESET
   * ======================================================= */

  private resetDailyCountIfNeeded(state: GeminiModelState, now: number): void {
    if (now < state.dailyResetAt) {
      return;
    }

    state.dailyRequestCount = 0;
    state.dailyResetAt = now + DAY_MS;
  }

  /* =======================================================
   * RESERVE (SYNC, NON-BLOCKING) — perilaku lama, tetap dipertahankan
   * ======================================================= */

  reserve(modelId: GeminiModelId): ReservedGeminiKey | null {
    const now = Date.now();
    const totalKeys = this.geminiKeys.length;

    if (totalKeys === 0) {
      return null;
    }

    for (let offset = 0; offset < totalKeys; offset++) {
      const index = (this.nextKeyIndex + offset) % totalKeys;
      const key = this.geminiKeys[index];
      const model = key.models[modelId];

      if (!model) {
        continue;
      }

      const state = model.state;
      this.cleanupSlidingWindow(state, now);
      this.resetDailyCountIfNeeded(state, now);

      // Key + model sedang dipakai
      if (state.reservationId !== null) {
        continue;
      }

      // RPM
      if (state.requestTimestamps.length >= model.rpm) {
        continue;
      }

      // TPM
      const tokensInWindow = state.tokenUsages.reduce(
        (total, usage) => total + usage.tokens,
        0,
      );

      if (tokensInWindow >= model.tpm) {
        continue;
      }

      // RPD
      if (state.dailyRequestCount >= model.rpd) {
        continue;
      }

      // Reserve
      const reservationId = crypto.randomUUID();
      state.reservationId = reservationId;

      // Round robin
      this.nextKeyIndex = (index + 1) % totalKeys;
      let released = false;

      const pool = this;

      return {
        reservationId,

        keyId: key.id,
        modelId,
        apiKey: key.apiKey,

        rpm: model.rpm,
        tpm: model.tpm,
        rpd: model.rpd,

        recordUsage(tokens: number) {
          if (released) {
            throw new Error("Cannot record usage after release.");
          }

          if (!Number.isFinite(tokens) || tokens < 0) {
            throw new Error(`Invalid token usage: ${tokens}`);
          }

          const timestamp = Date.now();

          state.requestTimestamps.push(timestamp);

          state.tokenUsages.push({
            timestamp,
            tokens,
          });

          state.dailyRequestCount++;
        },

        release() {
          if (released) {
            return;
          }

          released = true;

          if (state.reservationId === reservationId) {
            state.reservationId = null;
          }

          // Bangunkan siapapun yang lagi nunggu slot model ini.
          pool.slotEvents.emit(`release:${modelId}`);
        },
      };
    }

    return null;
  }

  /* =======================================================
   * RESERVE ASYNC (MENUNGGU SLOT) — fitur baru
   * ======================================================= */

  /**
   * Sama seperti reserve(), tapi kalau tidak ada slot kosong, thread akan
   * menunggu sampai:
   *  - ada reservation lain yang release() (event based, instan), atau
   *  - window RPM/TPM yang paling cepat expire sudah lewat (time based), atau
   *  - timeoutMs tercapai (default 30 detik) → return null.
   *
   * PENTING: karena reserve() di dalam sini tetap synchronous check-and-set,
   * tidak ada race condition walau banyak waiter dibangunkan bersamaan —
   * hanya satu yang akan berhasil mengambil slot, sisanya balik nunggu lagi.
   */
  async reserveAsync(
    modelId: GeminiModelId,
    options: ReserveWaitOptions = {},
  ): Promise<ReservedGeminiKey | null> {
    const timeoutMs = options.timeoutMs ?? 30_000;
    const deadline = Date.now() + timeoutMs;

    while (true) {
      if (options.signal?.aborted) {
        return null;
      }

      const reserved = this.reserve(modelId);
      if (reserved !== null) {
        return reserved;
      }

      const now = Date.now();
      const remaining = deadline - now;

      if (remaining <= 0) {
        return null;
      }

      const waitMs = Math.min(this.nextWakeupDelay(modelId, now), remaining);

      await this.waitForSlotOrTimeout(modelId, waitMs, options.signal);
    }
  }

  /**
   * Perkiraan berapa lama lagi sampai ada slot yang mungkin kebuka karena
   * window RPM geser (bukan karena release()). Dipakai sebagai upper bound
   * polling supaya kita tidak menunggu event release() selamanya kalau
   * ternyata semua key hanya kena limit waktu, bukan sedang dipakai.
   */
  private nextWakeupDelay(modelId: GeminiModelId, now: number): number {
    let earliest = Infinity;

    for (const key of this.geminiKeys) {
      const model = key.models[modelId];
      if (!model) continue;

      const state = model.state;

      if (state.reservationId !== null) {
        // Sedang dipakai thread lain — ini bakal dibangunkan lewat event
        // release(), jadi tidak perlu dihitung di sini.
        continue;
      }

      if (state.requestTimestamps.length > 0) {
        const oldest = state.requestTimestamps[0];
        const expiresAt = oldest + WINDOW_MS - now;
        earliest = Math.min(earliest, Math.max(expiresAt, 0));
      }
    }

    if (!Number.isFinite(earliest)) {
      // Tidak ada info waktu yang jelas (mis. semua key kena RPD harian) —
      // fallback ke polling interval pendek supaya tetap responsif.
      earliest = 1_000;
    }

    return Math.max(earliest, 50);
  }

  private waitForSlotOrTimeout(
    modelId: GeminiModelId,
    waitMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    return new Promise((resolve) => {
      const eventName = `release:${modelId}`;

      const cleanup = () => {
        clearTimeout(timer);
        this.slotEvents.off(eventName, onRelease);
        signal?.removeEventListener("abort", onAbort);
      };

      const onRelease = () => {
        cleanup();
        resolve();
      };

      const onAbort = () => {
        cleanup();
        resolve();
      };

      const timer = setTimeout(() => {
        cleanup();
        resolve();
      }, waitMs);

      this.slotEvents.once(eventName, onRelease);
      signal?.addEventListener("abort", onAbort, { once: true });
    });
  }
}
