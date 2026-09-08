# Project Tree — zen_gateway_production/src

## Directory Tree

```
src/
├── driver/
│   └── llm/
│       ├── llmCallDriver.ts
│       ├── llmCallDriverConfig.ts
│       └── tavily/
│           └── tavilyDriver.ts
├── providers/
│   ├── gemini/
│   │   ├── geminiProvider.ts
│   │   └── geminiProviderConfig.ts
│   ├── opencode/
│   │   ├── opencodeConfig.ts
│   │   ├── opencodeIdentity.ts
│   │   └── opencodeProvider.ts
│   ├── openrouter/
│   │   ├── openrouterConfig.ts
│   │   └── openrouterProvider.ts
│   └── tavily/
│       ├── tavilyConfig.ts
│       └── tavilyProvider.ts
├── routes/
│   └── agent_completion.ts
├── types/
│   ├── agent_types/
│   │   ├── agent_error.ts
│   │   ├── agent_request.ts
│   │   └── agent_response.ts
│   └── tavily/
│       ├── crawl.ts
│       ├── error.ts
│       ├── extract.ts
│       ├── index.ts
│       └── search.ts
└── server.ts
```

## Flat File List

| File | Relative Path |
|------|----------------|
| server.ts | `src/server.ts` |
| agent_completion.ts | `src/routes/agent_completion.ts` |
| llmCallDriver.ts | `src/driver/llm/llmCallDriver.ts` |
| llmCallDriverConfig.ts | `src/driver/llm/llmCallDriverConfig.ts` |
| tavilyDriver.ts | `src/driver/llm/tavily/tavilyDriver.ts` |
| geminiProvider.ts | `src/providers/gemini/geminiProvider.ts` |
| geminiProviderConfig.ts | `src/providers/gemini/geminiProviderConfig.ts` |
| opencodeConfig.ts | `src/providers/opencode/opencodeConfig.ts` |
| opencodeIdentity.ts | `src/providers/opencode/opencodeIdentity.ts` |
| opencodeProvider.ts | `src/providers/opencode/opencodeProvider.ts` |
| openrouterConfig.ts | `src/providers/openrouter/openrouterConfig.ts` |
| openrouterProvider.ts | `src/providers/openrouter/openrouterProvider.ts` |
| tavilyConfig.ts | `src/providers/tavily/tavilyConfig.ts` |
| tavilyProvider.ts | `src/providers/tavily/tavilyProvider.ts` |
| agent_error.ts | `src/types/agent_types/agent_error.ts` |
| agent_request.ts | `src/types/agent_types/agent_request.ts` |
| agent_response.ts | `src/types/agent_types/agent_response.ts` |
| crawl.ts | `src/types/tavily/crawl.ts` |
| error.ts | `src/types/tavily/error.ts` |
| extract.ts | `src/types/tavily/extract.ts` |
| index.ts | `src/types/tavily/index.ts` |
| search.ts | `src/types/tavily/search.ts` |
