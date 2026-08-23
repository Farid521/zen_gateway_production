import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Search Request — docs.tavily.com/documentation/api-reference/endpoint/search
// ─────────────────────────────────────────────────────────────

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
  include_answer: z
    .union([z.boolean(), z.enum(["basic", "advanced"])])
    .optional()
    .default(false),

  /** Include the cleaned and parsed HTML content of each result. */
  include_raw_content: z
    .union([z.boolean(), z.enum(["markdown", "text"])])
    .optional()
    .default(false),

  /** Include images in the response. */
  include_images: z.boolean().optional().default(false),

  /** When include_images is true, also add a descriptive text for each image. */
  include_image_descriptions: z.boolean().optional().default(false),

  /** Whether to include the favicon URL for each result. */
  include_favicon: z.boolean().optional().default(false),

  /** A list of domains to specifically include in the search results. Max 300. */
  include_domains: z.array(z.string()).max(300).optional().default([]),

  /** A list of domains to specifically exclude from the search results. Max 150. */
  exclude_domains: z.array(z.string()).max(150).optional().default([]),

  /** Filter results based on publish/updated date. */
  time_range: z
    .enum(["day", "week", "month", "year", "d", "w", "m", "y"])
    .nullable()
    .optional()
    .default(null),

  /** Will return all results after the specified start date (YYYY-MM-DD). */
  start_date: z.string().nullable().optional().default(null),

  /** Will return all results before the specified end date (YYYY-MM-DD). */
  end_date: z.string().nullable().optional().default(null),

  /** Boost search results from a specific country (only if topic is general). */
  country: z.string().nullable().optional().default(null),

  /** When true, Tavily auto-configures search parameters based on query intent. */
  auto_parameters: z.boolean().optional().default(false),

  /** Ensure only results containing exact quoted phrase(s) are returned. */
  exact_match: z.boolean().optional().default(false),

  /** Whether to include credit usage information in the response. */
  include_usage: z.boolean().optional().default(false),

  /** Enterprise only: whether to filter out adult or unsafe content. Not supported for `fast` or `ultra-fast`. */
  safe_search: z.boolean().optional().default(false),
});

export type TavilySearchRequest = z.infer<typeof TavilySearchRequestSchema>;

// ─────────────────────────────────────────────────────────────
// Search Response — individual result item
// ─────────────────────────────────────────────────────────────

export const TavilySearchResultSchema = z.object({
  /** Title of the search result. */
  title: z.string(),

  /** URL of the search result. */
  url: z.string(),

  /** Content snippet from the search result (chunks). */
  content: z.string(),

  /** Relevance score of the result. */
  score: z.number(),

  /** Full raw content of the page (if include_raw_content was requested). */
  raw_content: z.string().nullable().optional(),

  /** Favicon URL of the result source. */
  favicon: z.string().optional(),

  /** Images extracted from this result (url + description if requested). */
  images: z.array(z.unknown()).optional(),

  /** Published date of the result. */
  published_date: z.string().optional(),

  /** Unique identifier for the result. */
  id: z.string().optional(),
});

export type TavilySearchResult = z.infer<typeof TavilySearchResultSchema>;

// ─────────────────────────────────────────────────────────────
// Search Response — full search response
// ─────────────────────────────────────────────────────────────

export const TavilySearchResponseSchema = z.object({
  /** The original search query. */
  query: z.string(),

  /** LLM-generated answer (if include_answer was true/basic/advanced). */
  answer: z.string().nullable().optional(),

  /** Query-related images (if include_images was true). */
  images: z.array(z.unknown()).optional(),

  /** List of search result items. */
  results: z.array(TavilySearchResultSchema),

  /** Time taken by Tavily to process the request (in seconds). */
  response_time: z.union([z.string(), z.number()]),

  /** Auto-detected parameters (if auto_parameters was true). */
  auto_parameters: z
    .object({
      topic: z.string().optional(),
      search_depth: z.string().optional(),
    })
    .optional(),

  /** Usage information (if include_usage was true). */
  usage: z
    .object({
      credits: z.number().optional(),
    })
    .optional(),

  /** Unique request identifier. */
  request_id: z.string().optional(),
});

export type TavilySearchResponse = z.infer<typeof TavilySearchResponseSchema>;
