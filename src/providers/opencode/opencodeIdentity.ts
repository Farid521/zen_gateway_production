import crypto from "node:crypto";
import { opencodeConfig } from "./opencodeConfig";

export interface OpencodeIdentity {
  session: string;
  request: string;
}

/**
 * Generates a secure random identifier with the given prefix.
 */
export function generateId(prefix: string): string {
  return `${prefix}_${crypto.randomBytes(18).toString("base64url")}`;
}

/**
 * Creates a cached identity store with TTL-based rotation.
 *
 * Returns the same identity until the TTL expires, then regenerates it.
 */
export function createIdentityStore(ttlMs: number) {
  let cached: OpencodeIdentity | null = null;
  let expiresAt = 0;

  return {
    get(): OpencodeIdentity {
      const now = Date.now();
      if (!cached || now >= expiresAt) {
        cached = {
          session: generateId("ses"),
          request: generateId("msg"),
        };
        expiresAt = now + ttlMs;
      }
      return cached;
    },
    reset(): void {
      cached = null;
      expiresAt = 0;
    },
  };
}

export const opencodeIdentity = createIdentityStore(
  opencodeConfig.idRotationInterval,
);
