import { Request, Response, NextFunction, RequestHandler } from "express";
import { AgentCompletionRequest } from "../types/agent_types/agent_request";
import { createAgentErrorResponse } from "../types/agent_types/agent_error";
import { OpencodeProvider } from "../providers/opencode/opencodeProvider";
import { LlmCallAdapter } from "../providers/adapter/llm/llmCallAdapter";

const adapter = new LlmCallAdapter();

export const agent_completion: RequestHandler = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const parsed = AgentCompletionRequest.safeParse(req.body);

  if (!parsed.success) {
    const errorResp = createAgentErrorResponse(
      `Invalid request: ${parsed.error.issues
        .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
        .join("; ")}`,
      "invalid_request_error",
    );
    res.status(400).json(errorResp);
    return;
  }

  const bestModel = OpencodeProvider.getBestModel();
  console.log(`best model: ${JSON.stringify(bestModel)}`);

  if (!bestModel) {
    const errorResp = createAgentErrorResponse(
      "No available model found. Please try again later.",
      "service_unavailable",
      null,
      "no_model_available",
    );
    res.status(503).json(errorResp);
    return;
  }

  const result = await adapter.opencodeCallAdapter(
    bestModel.model,
    parsed.data,
  );

  if ("error" in result) {
    const { error } = result;

    if (
      error.type === "service_unavailable" ||
      error.code === "no_model_available"
    ) {
      res.status(503).json(result);
      return;
    }

    if (error.type === "invalid_request_error") {
      res.status(400).json(result);
      return;
    }

    res.status(502).json(result);
    return;
  }

  res.json(result);
};
