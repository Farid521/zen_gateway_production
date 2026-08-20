import { z } from "zod";

export const TextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  cache_prompt: z.boolean().optional(),
});

export const ImageUrlContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({
    url: z.string(),
  }),
  cache_prompt: z.boolean().optional(),
});

export const ContentPartSchema = z.union([
  TextContentPartSchema,
  ImageUrlContentPartSchema,
]);

export const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

export const ChatMessageSchema = z.object({
  role: z.enum([
    "system",
    "user",
    "assistant",
    "function",
    "tool",
  ]),

  content: z.union([
    z.string(),
    z.array(ContentPartSchema),
    z.null(),
  ]),

  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),

  function_call: z
    .object({
      name: z.string(),
      arguments: z.string(),
    })
    .optional(),
});

export const ToolDefinitionSchema = z.object({
  type: z.literal("function"),

  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: z
      .record(z.string(), z.unknown())
      .optional(),
  }),
});

export const ToolChoiceSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.literal("required"),
  z.object({
    type: z.literal("function"),
    function: z.object({
      name: z.string(),
    }),
  }),
]);

export const ChatCompletionRequestSchema = z.object({
  model: z.string(),
  messages: z.array(ChatMessageSchema),
  fallback: z.boolean().optional(),
  temperature: z.number().optional(),
  top_p: z.number().optional(),
  max_tokens: z.number().optional(),
  tools: z.array(ToolDefinitionSchema).optional(),
  tool_choice: ToolChoiceSchema.optional(),
  stream: z.boolean().optional(),

  response_format: z.object({
    type: z.enum(["text", "json_object"]),
  }).optional(),

  frequency_penalty: z.number().optional(),
  presence_penalty: z.number().optional(),

  stop: z.union([
    z.string(),
    z.array(z.string()),
  ]).optional(),

  n: z.number().optional(),
});