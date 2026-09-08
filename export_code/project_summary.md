# Project Summary — zen_gateway_production/src

## Project Information

- **Name**: zen_gateway_production
- **Language**: TypeScript
- **Framework**: Express.js
- **Runtime**: Node.js
- **Package Manager**: npm

## Directory Overview

| Directory | Purpose |
|-----------|---------|
| `src/` | Application source code root |
| `src/server.ts` | Express server entry point (port 3000) |
| `src/routes/` | HTTP route handlers |
| `src/driver/llm/` | LLM call adapters (Opencode + Gemini fallback chain) |
| `src/driver/llm/tavily/` | Tavily API client driver (search/extract/crawl) |
| `src/providers/gemini/` | Gemini API key pool with RPM/TPM/RPD rate limiting |
| `src/providers/opencode/` | OpenCode provider: model probing, identity rotation, best-model selection |
| `src/providers/openrouter/` | OpenRouter provider (singleton, session-based, not yet active) |
| `src/providers/tavily/` | Tavily API key pool with usage tracking |
| `src/types/agent_types/` | Zod schemas for Agent API request/response/error |
| `src/types/tavily/` | Zod schemas for Tavily search/extract/crawl/error |

## Entry Points

| File | Role |
|------|------|
| `src/server.ts` | Main entry — creates Express app, initializes providers, mounts routes |

## Configuration Files

| File | Purpose |
|------|---------|
| `package.json` | Dependencies, scripts |
| `tsconfig.json` | TypeScript compiler config |
| `.env` | Environment variables (Gemini keys, Tavily keys, OpenRouter key) |

## Dependencies (Key)

- `express` — HTTP framework
- `zod` — Runtime schema validation (used everywhere for request/response parsing)
- `dotenv` — Environment variable loading

## Architecture Notes

**Request flow**: `POST /v1/chat/completions` → route handler validates with Zod → tries Gemini (rate-limited key pool) → falls back to OpenCode (best-available free model via latency probe) → returns OpenAI-compatible response.

**Providers are singletons** initialized at startup via `getInstance()`. OpenCode provider runs a periodic model-probe cron (every 5 min) to discover available free models and measure latency.

**Tavily driver** supports search, extract, and crawl endpoints with Zod validation and a custom `TavilyError` class for normalized error handling.

**Binary files skipped**: None — all 22 files are TypeScript source (text).
