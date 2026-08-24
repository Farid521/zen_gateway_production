import { z } from "zod";

// ─────────────────────────────────────────────────────────────
// Crawl Request — docs.tavily.com/documentation/api-reference/endpoint/crawl
// ─────────────────────────────────────────────────────────────

export const TavilyCrawlRequestSchema = z.object({
  /** The root URL to begin the crawl. */
  url: z.string().url("Must be a valid URL").min(1, "url must not be empty"),

  /** Natural language instructions for the crawler (what to find). */
  instructions: z.string().optional(),

  /** Max depth of the crawl (1–5). Defines how far from base URL to explore. */
  max_depth: z.number().int().min(1).max(5).optional().default(1),

  /** Max number of links to follow per level (1–500). */
  max_breadth: z.number().int().min(1).max(500).optional().default(20),

  /**
   * Total number of links the crawler will process before stopping.
   * Local safeguard: capped at 100 to prevent excessive credit usage.
   * The official Tavily API does not enforce a strict hard limit for this field.
   */
  limit: z.number().int().min(1).max(100).optional().default(50),

  /** Regex patterns to restrict crawling to specific paths. */
  select_paths: z.array(z.string()).nullable().optional().default(null),

  /** Regex patterns to restrict crawling to specific domains. */
  select_domains: z.array(z.string()).nullable().optional().default(null),

  /** Regex patterns to exclude specific paths. */
  exclude_paths: z.array(z.string()).nullable().optional().default(null),

  /** Regex patterns to exclude specific domains. */
  exclude_domains: z.array(z.string()).nullable().optional().default(null),

  /** Whether to allow crawling external domains. */
  allow_external: z.boolean().optional().default(true),

  /** Whether to include images in crawl results. */
  include_images: z.boolean().optional().default(false),

  /** Depth of extraction: basic vs advanced (includes tables/embedded). */
  extract_depth: z.enum(["basic", "advanced"]).optional().default("basic"),

  /** Output format for raw_content. */
  format: z.enum(["markdown", "text"]).optional().default("markdown"),

  /** Whether to include favicon URL for each result. */
  include_favicon: z.boolean().optional().default(false),

  /** Max number of relevant chunks returned per source (1–5). */
  chunks_per_source: z.number().int().min(1).max(5).optional().default(3),

  /** Maximum time in seconds to wait for crawl before timing out (10–150). */
  timeout: z.number().min(10).max(150).optional().default(150),

  /** Whether to include credit usage information in the response. */
  include_usage: z.boolean().optional().default(false),
});

export type TavilyCrawlRequest = z.infer<typeof TavilyCrawlRequestSchema>;

// ─────────────────────────────────────────────────────────────
// Crawl Response — individual crawled page
// ─────────────────────────────────────────────────────────────

export const TavilyCrawlResultSchema = z.object({
  /** URL of the crawled page. */
  url: z.string(),

  /** Extracted content of the page. */
  raw_content: z.string(),

  /** Favicon URL (if include_favicon was true). */
  favicon: z.string().optional(),

  /** Images extracted (if include_images was true). */
  images: z.array(z.unknown()).optional(),

  /** Relevance score if query/instructions was provided. */
  score: z.number().optional(),
});

export type TavilyCrawlResult = z.infer<typeof TavilyCrawlResultSchema>;

// ─────────────────────────────────────────────────────────────
// Crawl Response — full crawl response
// ─────────────────────────────────────────────────────────────

export const TavilyCrawlResponseSchema = z.object({
  /** The base URL that was crawled. */
  base_url: z.string(),

  /** List of extracted content from crawled URLs. */
  results: z.array(TavilyCrawlResultSchema),

  /** Time taken to process the request (in seconds). */
  response_time: z.union([z.string(), z.number()]),

  /** Usage information (if include_usage was true). */
  usage: z
    .object({
      credits: z.number().optional(),
    })
    .optional(),

  /** Unique request identifier. */
  request_id: z.string().optional(),
});

export type TavilyCrawlResponse = z.infer<typeof TavilyCrawlResponseSchema>;
