import type { Usage } from "./types";

/**
 * Preços em US$ por 1 milhão de tokens. Conferir em https://openai.com/api/pricing
 * antes de mudar orçamento. Tokens de raciocínio contam como saída.
 */
export const PRICES: Record<string, { input: number; cachedInput: number; output: number }> = {
  "gpt-5-mini": { input: 0.25, cachedInput: 0.025, output: 2.0 },
  "gpt-5-nano": { input: 0.05, cachedInput: 0.005, output: 0.4 },
  "gpt-5": { input: 1.25, cachedInput: 0.125, output: 10.0 },
  mock: { input: 0.25, cachedInput: 0.025, output: 2.0 },
};

export function priceFor(model: string) {
  const p = PRICES[model] ?? PRICES[model.replace(/-\d{4}-\d{2}-\d{2}$/, "")];
  // Modelo desconhecido: usa o preço mais caro da tabela para nunca subestimar.
  return p ?? { input: 1.25, cachedInput: 0.125, output: 10.0 };
}

export function costUsd(model: string, u: Usage): number {
  const p = priceFor(model);
  const uncached = Math.max(0, u.inputTokens - u.cachedInputTokens);
  return (uncached * p.input + u.cachedInputTokens * p.cachedInput + u.outputTokens * p.output) / 1_000_000;
}

/** Pior caso de uma chamada (todo input sem cache + saída máxima). */
export function worstCaseCostUsd(model: string, inputTokens: number, maxOutputTokens: number): number {
  return costUsd(model, { inputTokens, cachedInputTokens: 0, outputTokens: maxOutputTokens });
}

/** Estimativa grosseira de tokens (~4 caracteres por token, arredondando para cima). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}
