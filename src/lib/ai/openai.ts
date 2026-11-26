import OpenAI from "openai";
import type { AIProvider, ChatMessage, ChatRequest, ChatResponse } from "./types";

export class OpenAIProvider implements AIProvider {
  readonly name = "openai";
  constructor(readonly model: string = process.env.OPENAI_MODEL || "gpt-5-mini") {}

  isConfigured() {
    return Boolean(process.env.OPENAI_API_KEY);
  }

  private client() {
    return new OpenAI({ apiKey: process.env.OPENAI_API_KEY, timeout: 60_000, maxRetries: 1 });
  }

  async chat(req: ChatRequest): Promise<ChatResponse> {
    const res = await this.client().chat.completions.create({
      model: this.model,
      messages: req.messages.map(toOpenAI),
      tools: req.tools?.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.parameters },
      })),
      max_completion_tokens: req.maxOutputTokens,
      reasoning_effort: "low",
    });
    const choice = res.choices[0];
    const toolCalls = (choice?.message.tool_calls ?? [])
      .filter((c) => c.type === "function")
      .map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments }));
    return {
      text: choice?.message.content ?? "",
      toolCalls,
      model: res.model || this.model,
      usage: {
        inputTokens: res.usage?.prompt_tokens ?? 0,
        cachedInputTokens: res.usage?.prompt_tokens_details?.cached_tokens ?? 0,
        outputTokens: res.usage?.completion_tokens ?? 0,
      },
    };
  }
}

function toOpenAI(m: ChatMessage): OpenAI.Chat.Completions.ChatCompletionMessageParam {
  switch (m.role) {
    case "system":
      return { role: "developer", content: m.content };
    case "user":
      return { role: "user", content: m.content };
    case "assistant":
      return {
        role: "assistant",
        content: m.content || null,
        tool_calls: m.toolCalls?.length
          ? m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } }))
          : undefined,
      };
    case "tool":
      return { role: "tool", tool_call_id: m.toolCallId, content: m.content };
  }
}
