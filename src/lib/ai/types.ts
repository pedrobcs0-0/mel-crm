/** Contrato neutro de provedor de IA: trocar de modelo = nova implementação desta interface. */

export type ChatRole = "system" | "user" | "assistant" | "tool";

export interface ToolCall {
  id: string;
  name: string;
  /** Argumentos já em JSON (string), como o modelo enviou. */
  arguments: string;
}

export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema dos parâmetros. */
  parameters: Record<string, unknown>;
}

export interface Usage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  maxOutputTokens: number;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  usage: Usage;
  model: string;
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  isConfigured(): boolean;
  chat(req: ChatRequest): Promise<ChatResponse>;
}
