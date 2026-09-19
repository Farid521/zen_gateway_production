import { Response } from "express";
import { AgentError } from "../types/agent_types/agent_error";

/**
 * Kode error yang artinya "sisi kita / provider yang bermasalah" -> 503, layak dicoba ulang.
 * Sisanya 502, kecuali invalid_request_error (400).
 */
const RETRYABLE_CODES = new Set([
  "provider_unavailable", // 5xx dari provider (termasuk "high demand")
  "upstream_auth_error", // 401/403 dari provider
  "quota_exhausted", // kuota habis, termasuk saat DeepSeek ikut gagal
  "missing_deepseek_key", // konfigurasi server
]);

/**
 * Satu-satunya tempat memetakan AgentError -> status HTTP.
 * Return true kalau respons sudah dikirim, false kalau bukan AgentError (biarkan next(err)).
 */
export function sendAgentError(res: Response, err: unknown): boolean {
  if (!(err instanceof AgentError)) return false;

  const { error } = err;
  const code = error.code ?? "";

  if (error.type === "invalid_request_error") {
    // request-nya sendiri yang tidak valid (skema route, atau dua provider sama-sama menolak 400)
    res.status(400).json(err.toResponse());
  } else if (error.type === "service_unavailable" || RETRYABLE_CODES.has(code)) {
    // gangguan/provider habis: bukan salah pengguna, jadi beri tahu layak dicoba lagi
    res.status(503).json(err.toResponse());
  } else {
    res.status(502).json(err.toResponse());
  }

  return true;
}
