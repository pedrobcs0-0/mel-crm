import { MockProvider } from "./mock";
import { OpenAIProvider } from "./openai";
import type { AIProvider } from "./types";

export function getProvider(): AIProvider {
  const name = process.env.AI_PROVIDER || "openai";
  if (name === "mock") {
    if (process.env.NODE_ENV === "production" && process.env.ALLOW_MOCK_AI !== "1") {
      throw new Error("Provedor simulado não é permitido em produção");
    }
    return new MockProvider();
  }
  if (name === "openai") return new OpenAIProvider();
  throw new Error(`Provedor de IA desconhecido: ${name}`);
}

export type { AIProvider } from "./types";
