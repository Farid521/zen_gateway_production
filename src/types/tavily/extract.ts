import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Extract Request — docs.tavily.com/documentation/api-reference/endpoint/extract
// ─────────────────────────────────────────────────────────────

export const TavilyExtractRequestSchema = z.object({
  /** One or more URLs to extract. Max 20 URLs. */
  urls: z.union([
    z.string().url(),
    z.array(z.string().url()).min(1).max(20),
  ]),

  /** Query to rerank chunks based on relevance. Chunks appear in raw_content as <chunk>. */
  query: z.string().optional(),

  /** Max number of relevant chunks returned per source (1–5). Only when query is provided. */
  chunks_per_source: z.number().int().min(1).max(5).optional().default(3),

  /** Depth of extraction: basic (1 credit/5 urls) vs advanced (2 credits/5 urls, includes tables/embedded). */
  extract_depth: z.enum(["basic", "advanced"]).optional().default("basic"),

  /** Whether to include images in the response. */
  include_images: z.boolean().optional().default(false),

  /** Whether to include favicon URL for each result. */
  include_favicon: z.boolean().optional().default(false),

  /** Output format for raw_content. */
  format: z.enum(["markdown", "text"]).optional().default("markdown"),

  /** Maximum time in seconds to wait before timing out (1.0–60.0). Default 10s basic / 30s advanced. */
  timeout: z.number().min(1.0).max(60.0).optional(),

  /** Whether to include credit usage information in the response. */
  include_usage: z.boolean().optional().default(false),
});

export type TavilyExtractRequest = z.infer<typeof TavilyExtractRequestSchema>;

// ─────────────────────────────────────────────────────────────
// Extract Response — individual result item
// ─────────────────────────────────────────────────────────────

export const TavilyExtractResultSchema = z.object({
  /** URL that was extracted. */
  url: z.string(),

  /** Extracted content (markdown or text based on format). */
  raw_content: z.string(),

  /** Images extracted from the page (if include_images was true). */
  images: z.array(z.unknown()).optional(),

  /** Favicon URL (if include_favicon was true). */
  favicon: z.string().optional(),
});

export type TavilyExtractResult = z.infer<typeof TavilyExtractResultSchema>;

export const TavilyExtractFailedResultSchema = z.object({
  /** URL that failed to extract. */
  url: z.string(),

  /** Error reason for failure. */
  error: z.string(),
});

export type TavilyExtractFailedResult = z.infer<typeof TavilyExtractFailedResultSchema>;

// ─────────────────────────────────────────────────────────────
// Extract Response — full extract response
// ─────────────────────────────────────────────────────────────

export const TavilyExtractResponseSchema = z.object({
  /** List of successfully extracted pages. */
  results: z.array(TavilyExtractResultSchema),

  /** List of URLs that failed to extract. */
  failed_results: z.array(TavilyExtractFailedResultSchema).optional().default([]),

  /** Time taken to process the request (in seconds). */
  response_time: z.union([z.string(), z.number()]),

  /** Usage information (if include_usage was true). May be 0 if <5 extractions. */
  usage: z
    .object({
      credits: z.number().optional(),
    })
    .optional(),

  /** Unique request identifier. */
  request_id: z.string().optional(),
});

export type TavilyExtractResponse = z.infer<typeof TavilyExtractResponseSchema>;
