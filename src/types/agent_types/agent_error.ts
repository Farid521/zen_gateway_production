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

export function createAgentErrorResponse(
  message: string,
  type: string = "invalid_request_error",
  param: string | null = null,
  code: string | null = null,
  details?: unknown
): AgentErrorResponse {
  return {
    error: {
      message,
      type,
      param,
      code,
      ...(details !== undefined ? { details } : {}),
    },
  };
}