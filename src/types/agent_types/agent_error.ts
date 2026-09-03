import { z } from "zod";

export const ServerErrorSchema = z.object({
  message: z.string(),
  type: z.string(),
  param: z.string().nullable().optional(),
  code: z.string().nullable().optional(),
  details: z.unknown().optional(),
});

export type ServerError = z.infer<typeof ServerErrorSchema>;

export const AgentErrorResponseSchema = z.object({
  error: ServerErrorSchema,
});

export type AgentErrorResponse = z.infer<typeof AgentErrorResponseSchema>;

export class AgentError extends Error {
  readonly error: ServerError;
  constructor(err: ServerError) {
    super(err.message);
    this.name = "AgentError";
    this.error = err;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  toResponse(): AgentErrorResponse {
    return AgentErrorResponseSchema.parse({ error: this.error });
  }
}

export function createAgentError(
  message: string,
  type: string = "invalid_request_error",
  param: string | null = null,
  code: string | null = null,
  details?: unknown
): AgentError {
  return new AgentError({
    message,
    type,
    param,
    code,
    ...(details !== undefined ? { details } : {}),
  });
}

// ponytail: alias untuk backward compat, hapus jika full rename breaking selesai
export const createAgentErrorResponse = createAgentError;
