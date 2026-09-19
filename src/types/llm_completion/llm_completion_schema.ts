import { z } from "zod";

export const LlmCompletionSchema = z.object({
  is_relevant: z.boolean(),
  has_basic_explanation: z.boolean(),
  has_basic_equations: z.boolean(),
  confidence: z.enum(["high", "medium", "low"]),
  reason: z.string().max(150),
  journal_title: z.string().nullable(),
  apa_citation: z.string().nullable(),
});

export type LlmCompletion = z.infer<typeof LlmCompletionSchema>;
