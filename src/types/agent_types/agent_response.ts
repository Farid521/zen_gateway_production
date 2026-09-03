import { z } from "zod";

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.string(),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});
export type ToolCall = z.infer<typeof ToolCallSchema>;

const ResponseTextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
});

const ResponseImageContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({ url: z.string() }),
});

const ResponseContentSchema = z.union([
  z.string(),
  z.array(
    z.union([ResponseTextContentPartSchema, ResponseImageContentPartSchema]),
  ),
  z.null(),
]);

export const AssistantMessageSchema = z.object({
  role: z.literal("assistant"),
  content: ResponseContentSchema.nullish(),
  tool_calls: z.array(ToolCallSchema).nullish(),
  reasoning_content: z.string().nullable().optional(),
});
export type AssistantMessage = z.infer<typeof AssistantMessageSchema>;

export const FinishReasonSchema = z.enum([
  "stop",
  "length",
  "tool_calls",
  "content_filter",
  "function_call",
  "insufficient_system_resource",
  "null",
  "error",
]);
export type FinishReason = z.infer<typeof FinishReasonSchema>;

export const ChoiceSchema = z.object({
  index: z.number().int().nonnegative(),
  message: AssistantMessageSchema,
  finish_reason: FinishReasonSchema.nullable(),
  logprobs: z.null().default(null),
});
export type Choice = z.infer<typeof ChoiceSchema>;

export const UsageSchema = z.object({
  prompt_tokens: z.number().int().nonnegative(),
  completion_tokens: z.number().int().nonnegative(),
  total_tokens: z.number().int().nonnegative(),
  cached_content_token_count: z.number().int().nonnegative().optional(),
  thoughts_token_count: z.number().int().nonnegative().optional(),
});
export type Usage = z.infer<typeof UsageSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// 1. AgentCompletionResponse (non-streaming)
// ─────────────────────────────────────────────────────────────────────────────

export const AgentCompletionResponse = z.object({
  id: z.string(),
  object: z.literal("chat.completion"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(ChoiceSchema).min(1),
  usage: UsageSchema.optional(),
  system_fingerprint: z.string().optional(),
});
export type AgentCompletionResponse = z.infer<typeof AgentCompletionResponse>;

export const DeltaSchema = z.object({
  role: z.literal("assistant").optional(),
  content: z.string().nullable().optional(),
  tool_calls: z
    .array(
      z.object({
        index: z.number().int(),
        id: z.string().optional(),
        type: z.literal("function").optional(),
        function: z
          .object({
            name: z.string().optional(),
            arguments: z.string().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
  reasoning_content: z.string().nullable().optional(),
});
export type Delta = z.infer<typeof DeltaSchema>;

export const ChunkChoiceSchema = z.object({
  index: z.number().int().nonnegative(),
  delta: DeltaSchema,
  finish_reason: FinishReasonSchema.nullable(),
  logprobs: z.null().default(null),
});

export const AgentCompletionChunk = z.object({
  id: z.string(),
  object: z.literal("chat.completion.chunk"),
  created: z.number().int(),
  model: z.string(),
  choices: z.array(ChunkChoiceSchema),
  usage: UsageSchema.optional(),
});
export type AgentCompletionChunk = z.infer<typeof AgentCompletionChunk>;
