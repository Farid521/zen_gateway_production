import {
  OpenRouterConfig,
  createOpenRouterConfig,
} from "./openrouterConfig";

// OPENCODE PROVIDER IS NOT AVAILABLE YET. THIS PROVIDER IS ALSO STILL HAS THROW ERROR FEATURES IN CONFIG.

/* =========================================================
 * SESSION
 * ========================================================= */

export interface OpenRouterSession {
  /** Nomor urut request (1-based). */
  readonly id: number;
  /** API key OpenRouter. */
  readonly apiKey: string;
  /**
   * Panggil setelah dapat response untuk mencatat jumlah token
   * yang baru saja digunakan pada request ini.
   */
  updateTokenCount(tokens: number): void;
}

/* =========================================================
 * PROVIDER (SINGLETON)
 * ========================================================= */

export class OpenRouterProvider {
  private static instance: OpenRouterProvider | null = null;

  private readonly config: OpenRouterConfig;
  private requestCount = 0;
  private totalTokensUsed = 0;

  private constructor(config: OpenRouterConfig) {
    this.config = config;
  }

  /* =======================================================
   * INITIALIZE
   * ======================================================= */

  /**
   * Initializes the singleton with the given config.
   *
   * Throws when the provider has already been initialized.
   */
  static initialize(
    config: OpenRouterConfig = createOpenRouterConfig(),
  ): OpenRouterProvider {
    if (OpenRouterProvider.instance !== null) {
      throw new Error("OpenRouterProvider has already been initialized.");
    }
    OpenRouterProvider.instance = new OpenRouterProvider(config);
    return OpenRouterProvider.instance;
  }

  /* =======================================================
   * GET INSTANCE
   * ======================================================= */

  /**
   * Returns the singleton instance, creating it from environment
   * when not yet initialized.
   */
  static getInstance(): OpenRouterProvider {
    if (OpenRouterProvider.instance === null) {
      OpenRouterProvider.instance = new OpenRouterProvider(
        createOpenRouterConfig(),
      );
    }
    return OpenRouterProvider.instance;
  }

  /* =======================================================
   * RESET (TEST HELPER)
   * ======================================================= */

  /**
   * Resets the singleton. Test helper only.
   */
  static _resetForTest(): void {
    OpenRouterProvider.instance = null;
  }

  /* =======================================================
   * GET SESSION
   * ======================================================= */

  /**
   * Generates a new session for a single request.
   *
   * Each call increments the internal request counter.
   * The returned session carries the API key and an
   * `updateTokenCount(tokens)` callback the caller should invoke
   * after receiving a successful response to track token usage.
   */
  getSession(): OpenRouterSession {
    this.requestCount++;

    const id = this.requestCount;
    const apiKey = this.config.apiKey;
    const self = this;

    const session: OpenRouterSession = {
      id,
      apiKey,
      updateTokenCount(tokens: number) {
        if (!Number.isFinite(tokens) || tokens < 0) {
          throw new Error(`Invalid token count: ${tokens}`);
        }
        self.totalTokensUsed += tokens;
      },
    };

    return session;
  }

  /* =======================================================
   * STATS
   * ======================================================= */

  /**
   * Returns the total number of sessions created since initialization.
   */
  getRequestCount(): number {
    return this.requestCount;
  }

  /**
   * Returns the total number of tokens recorded via
   * `updateTokenCount()` since initialization.
   */
  getTotalTokensUsed(): number {
    return this.totalTokensUsed;
  }
}
