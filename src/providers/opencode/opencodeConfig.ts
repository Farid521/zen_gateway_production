interface OpencodeConfig {
  apiKey: string;
  opencodeBaseUrl: {
    chatCompletion: string;
    availableModels: string;
  };
  requestTimeout: number;
  modelProbeInterval: number;
  idRotationInterval: number;
}

export const opencodeConfig: OpencodeConfig = {
  apiKey: "public",
  opencodeBaseUrl: {
    chatCompletion: "https://opencode.ai/zen/v1/chat/completions",
    availableModels: "https://opencode.ai/zen/v1/models",
  },
  requestTimeout: 60 * 1000,
  modelProbeInterval: 5 * 60 * 1000,
  idRotationInterval: 15 * 60 * 1000,
};

// OpenAI message schemas.

export type Role = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
  role: Role;
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
}

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  top_p?: number;
  max_tokens?: number;
  stop?: string | string[];
  stream?: boolean;
  stream_options?: { include_usage?: boolean };
  tools?: ToolDefinition[];
  tool_choice?:
  | "auto"
  | "none"
  | "required"
  | { type: "function"; function: { name: string } };
  presence_penalty?: number;
  frequency_penalty?: number;
  logprobs?: boolean;
  seed?: number;
  user?: string;
}

export interface ChatCompletionResponse {
  id: string;
  object: "chat.completion";
  created: number;
  model: string;
  choices: {
    index: number;
    finish_reason: "stop" | "length" | "tool_calls" | "content_filter" | null;
    logprobs: unknown;
    message: ChatMessage & { reasoning_content?: string };
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    prompt_cache_hit_tokens?: number;
    prompt_cache_miss_tokens?: number;
    prompt_tokens_details?: { cached_tokens?: number };
    completion_tokens_details?: { reasoning_tokens?: number };
  };
  cost?: string;
}

// Model probe and availability interfaces.

export interface ModelProbeResult {
  model: string;
  is_available: boolean;
  latencyMs: number;
  checkedAt: string;
}

export interface AvailableOpencodeModel {
  availableModel: ModelProbeResult[]
}

export interface Model {
  modelName: string
}

export interface BestModelResult {
  model: string;
  latencyMs: number;
  checkedAt: string;
}
