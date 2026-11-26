import { describe, expect, it } from "vitest";
import { costUsd, priceFor, worstCaseCostUsd } from "@/lib/ai/pricing";
import { evaluateBudget } from "@/lib/usage/budget";

describe("custo", () => {
  it("calcula gpt-5-mini com cache", () => {
    // 10k entrada (2k em cache) + 1k saída
    const c = costUsd("gpt-5-mini", { inputTokens: 10_000, cachedInputTokens: 2_000, outputTokens: 1_000 });
    expect(c).toBeCloseTo((8_000 * 0.25 + 2_000 * 0.025 + 1_000 * 2) / 1e6, 10);
  });
  it("reconhece versões datadas e usa preço alto para desconhecidos", () => {
    expect(priceFor("gpt-5-mini-2025-08-07").output).toBe(2);
    expect(priceFor("modelo-novo").output).toBe(10);
  });
  it("pior caso considera saída máxima", () => {
    expect(worstCaseCostUsd("gpt-5-mini", 4000, 1500)).toBeCloseTo((4000 * 0.25 + 1500 * 2) / 1e6, 10);
  });
});

describe("orçamento", () => {
  const s = { dailyLimitUsd: 1, monthlyLimitUsd: 10, aiPaused: false };
  it("libera abaixo do limite", () => expect(evaluateBudget(s, { today: 0.5, month: 5 }, 0.01).ok).toBe(true));
  it("bloqueia pelo diário", () => expect(evaluateBudget(s, { today: 0.995, month: 5 }, 0.01).ok).toBe(false));
  it("bloqueia pelo mensal", () => expect(evaluateBudget(s, { today: 0, month: 9.995 }, 0.01).ok).toBe(false));
  it("bloqueia quando pausada", () => expect(evaluateBudget({ ...s, aiPaused: true }, { today: 0, month: 0 }, 0).ok).toBe(false));
  it("teto absoluto vence configuração maior", () =>
    expect(evaluateBudget({ ...s, monthlyLimitUsd: 50, dailyLimitUsd: 50 }, { today: 0, month: 9.999 }, 0.01).ok).toBe(false));
});
