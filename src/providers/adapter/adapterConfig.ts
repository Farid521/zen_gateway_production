export interface LlmCallRequest {
  prompt: string;
}

export interface LlmCallResult {
  content: string;
  totalTokens: number;
}
