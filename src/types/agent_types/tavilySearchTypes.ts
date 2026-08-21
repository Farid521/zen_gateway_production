import { z } from "zod";


export const TavilySearchRequestSchema = z.object({
  /** The search query to execute with Tavily. */
  query: z.string().min(1, "Query must not be empty"),

  /** Controls the latency vs. relevance tradeoff. */
  search_depth: z
    .enum(["basic", "advanced", "fast", "ultra-fast"])
    .optional()
    .default("basic"),

  /** The category of the search. */
  topic: z.enum(["general", "news", "finance"]).optional().default("general"),

  /** The maximum number of search results to return (0–20). */
  max_results: z.number().int().min(0).max(20).optional().default(5),

  /** Max number of relevant chunks returned per source (1–3). */
  chunks_per_source: z.number().int().min(1).max(3).optional().default(3),

  /** Include an LLM-generated answer to the query. */
  include_answer: z.boolean().optional().default(false),

  /** Include the cleaned and parsed HTML content of each result. */
  include_raw_content: z.boolean().optional().default(false),

  /** Include images in the response. */
  include_images: z.boolean().optional().default(false),

  /** When include_images is true, also add a descriptive text for each image. */
  include_image_descriptions: z.boolean().optional().default(false),

  /** A list of domains to specifically include in the search results. */
  include_domains: z.array(z.string()).optional().default([]),

  /** A list of domains to specifically exclude from the search results. */
  exclude_domains: z.array(z.string()).optional().default([]),

  /** Filter results based on publish/updated date. */
  time_range: z
    .enum(["day", "week", "month", "year", "d", "w", "m", "y"])
    .nullable()
    .optional()
    .default(null),

  /** Boost search results from a specific country. */
  country: z.string().nullable().optional().default(null),
});

export type TavilySearchRequest = z.infer<typeof TavilySearchRequestSchema>;

// ─────────────────────────────────────────────────────────────
// Response — individual result item
// ─────────────────────────────────────────────────────────────

export const TavilySearchResultSchema = z.object({
  /** Title of the search result. */
  title: z.string(),

  /** URL of the search result. */
  url: z.string(),

  /** Content snippet from the search result. */
  content: z.string(),

  /** Relevance score of the result. */
  score: z.number(),

  /** Full raw content of the page (if requested). */
  raw_content: z.string().nullable().optional(),

  /** Favicon URL of the result source. */
  favicon: z.string().optional(),

  /** Images extracted from this result. */
  images: z.array(z.unknown()).optional(),

  /** Unique identifier for the result. */
  id: z.string().optional(),
});

export type TavilySearchResult = z.infer<typeof TavilySearchResultSchema>;

// ─────────────────────────────────────────────────────────────
// Response — full search response
// ─────────────────────────────────────────────────────────────

export const TavilySearchResponseSchema = z.object({
  /** The original search query. */
  query: z.string(),

  /** LLM-generated answer (if include_answer was true). */
  answer: z.string().nullable().optional(),

  /** Query-related images (if include_images was true). */
  images: z.array(z.unknown()).optional(),

  /** List of search result items. */
  results: z.array(TavilySearchResultSchema),

  /** Time taken by Tavily to process the request (in seconds). */
  response_time: z.string(),

  /** Auto-detected parameters (if auto_parameters was true). */
  auto_parameters: z
    .object({
      topic: z.string().optional(),
      search_depth: z.string().optional(),
    })
    .optional(),

  /** Usage information. */
  usage: z
    .object({
      credits: z.number().optional(),
    })
    .optional(),

  /** Unique request identifier. */
  request_id: z.string().optional(),
});

export type TavilySearchResponse = z.infer<typeof TavilySearchResponseSchema>;

// ─────────────────────────────────────────────────────────────
// Error response from Tavily
// ─────────────────────────────────────────────────────────────

export const TavilyErrorResponseSchema = z.object({
  detail: z.object({
    error: z.string(),
  }),
});

export type TavilyErrorResponse = z.infer<typeof TavilyErrorResponseSchema>;
