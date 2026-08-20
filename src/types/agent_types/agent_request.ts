import { z } from "zod";

// ------------------------------------------------------------
// Content parts
// ------------------------------------------------------------

const TextContentPartSchema = z.object({
  type: z.literal("text"),
  text: z.string(),
  cache_prompt: z.boolean().optional(),
});

const ImageUrlContentPartSchema = z.object({
  type: z.literal("image_url"),
  image_url: z.object({ url: z.string() }),
  cache_prompt: z.boolean().optional(),
});

const ContentPartSchema = z.discriminatedUnion("type", [
  TextContentPartSchema,
  ImageUrlContentPartSchema,
]);

const MessageContentSchema = z.union([
  z.string(),
  z.array(ContentPartSchema),
  z.null(),
]);

// ------------------------------------------------------------
// Tool calls (dalam assistant message)
// ------------------------------------------------------------

const ToolCallSchema = z.object({
  id: z.string(),
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    arguments: z.string(),
  }),
});

// ------------------------------------------------------------
// Messages
// ------------------------------------------------------------

const MessageRoleSchema = z.enum([
  "system",
  "user",
  "assistant",
  "function",
  "tool",
]);

const ChatMessageSchema = z.object({
  role: MessageRoleSchema,
  content: MessageContentSchema.nullish(),
  name: z.string().optional(),
  tool_calls: z.array(ToolCallSchema).optional(),
  tool_call_id: z.string().optional(),
  function_call: z
    .object({ name: z.string(), arguments: z.string() })
    .optional(),
});

// ------------------------------------------------------------
// Tool definitions
// ------------------------------------------------------------

const ToolParametersSchema = z
  .object({
    type: z.literal("object"),
    properties: z.record(z.string(), z.record(z.string(), z.unknown())),
    required: z.array(z.string()).optional(),
  })
  .passthrough();

const ToolDefinitionSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string().optional(),
    parameters: ToolParametersSchema.optional(),
  }),
});

// ------------------------------------------------------------
// Tool choice
// ------------------------------------------------------------

const ToolChoiceSchema = z.union([
  z.literal("none"),
  z.literal("auto"),
  z.literal("required"),
  z.object({
    type: z.literal("function"),
    function: z.object({ name: z.string() }),
  }),
]);

// MISING: thingking option. usually require extending the fields, but without thingking extend work just fine. 
export const AgentCompletionRequest = z
  .object({
    model: z.string(),
    messages: z.array(ChatMessageSchema).min(1),
    fallback: z.boolean().optional(),
    temperature: z.number().optional(),
    top_p: z.number().optional(),
    max_tokens: z.number().int().positive().optional(),
    tools: z.array(ToolDefinitionSchema).optional(),
    tool_choice: ToolChoiceSchema.optional(),
    stream: z.boolean().optional(),
    response_format: z
      .object({ type: z.enum(["text", "json_object"]) })
      .optional(),
    frequency_penalty: z.number().optional(),
    presence_penalty: z.number().optional(),
    stop: z.union([z.string(), z.array(z.string())]).optional(),
    n: z.number().int().positive().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.tools) return;

    data.tools.forEach((tool, toolIndex) => {
      const params = tool.function.parameters;
      if (!params?.required) return;

      const propKeys = Object.keys(params.properties ?? {});
      const missing = params.required.filter((r) => !propKeys.includes(r));

      if (missing.length > 0) {
        ctx.addIssue({
          code: "custom",
          message: `Tool "${tool.function.name}" has "required" field(s) [${missing.join(", ")}] not present in "properties"`,
          path: ["tools", toolIndex, "function", "parameters", "required"],
        });
      }
    });
  });

export type AgentCompletionRequestType = z.infer<typeof AgentCompletionRequest>;
