import { inArray, eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { getProvider } from "../ai";
import { costUsd, estimateTokens, worstCaseCostUsd } from "../ai/pricing";
import type { AIProvider } from "../ai/types";
import { evaluateBudget, getSettings, getSpend } from "../usage/budget";
import { SECTION_KEYS } from "./behavior/defaults";
import { PROTECTED_RULES } from "./behavior/protected";
import { loadSections } from "./behavior/sections";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["resumo", "alteracoes"],
  properties: {
    resumo: { type: "string" },
    alteracoes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["secao", "justificativa", "novo_conteudo"],
        properties: { secao: { type: "string", enum: SECTION_KEYS }, justificativa: { type: "string" }, novo_conteudo: { type: "string" } },
      },
    },
  },
};

const Parsed = z.object({
  resumo: z.string().max(3000),
  alteracoes: z.array(z.object({ secao: z.enum(SECTION_KEYS as [string, ...string[]]), justificativa: z.string().max(2000), novo_conteudo: z.string().max(20000) })).max(6),
});

const MAX_OUT = 12000;

/**
 * Analisa as correções do laboratório e PROPÕE mudanças gerais nas seções editáveis.
 * Nada é aplicado automaticamente: uma pessoa revisa e aplica no painel.
 */
export async function generateProposal(provider: AIProvider = getProvider()) {
  const feedback = await db.select().from(schema.responseFeedback).where(eq(schema.responseFeedback.status, "nova"));
  if (!feedback.length) return { ok: false as const, error: "Não há correções novas para analisar." };
  if (!provider.isConfigured()) return { ok: false as const, error: "Chave da IA não configurada." };

  const sections = await loadSections();
  const prompt = `Você é especialista em atendimento consultivo de consultórios odontológicos particulares e em escrever instruções para assistentes virtuais.
A equipe corrigiu respostas da assistente virtual no laboratório. Proponha mudanças GERAIS nas seções editáveis do comportamento, para que a melhoria se generalize para outras situações. Não crie regras que só resolvem o exemplo específico, não copie as respostas corrigidas como roteiro e não invente dados do consultório (valores, condições, diferenciais).
As regras protegidas abaixo não podem ser alteradas nem contrariadas.

${PROTECTED_RULES}

# Seções editáveis atuais
${sections.map((s) => `<secao chave="${s.key}" titulo="${s.title}">\n${s.content}\n</secao>`).join("\n\n")}

# Correções do laboratório
${feedback
  .map(
    (f, i) => `<correcao n="${i + 1}">
Conversa até o ponto:
${f.context}
Resposta da atendente (ruim): ${f.badResponse}
Motivo apontado pela equipe: ${f.reason}
${f.betterResponse ? `Resposta que a equipe considera melhor: ${f.betterResponse}` : ""}
</correcao>`,
  )
  .join("\n")}

Responda com:
- resumo: em português simples, para o dono do consultório, quais padrões você identificou e o que propõe mudar.
- alteracoes: no máximo 4 seções, cada uma com o NOVO conteúdo COMPLETO da seção (não só o trecho), mantendo o que já funciona, e a justificativa.`;

  const est = estimateTokens(prompt);
  const budget = evaluateBudget(await getSettings(), await getSpend(), worstCaseCostUsd(provider.model, est, MAX_OUT));
  if (!budget.ok) return { ok: false as const, error: budget.reason };

  const res = await provider.chat({
    messages: [{ role: "user", content: prompt }],
    jsonSchema: { name: "proposta_comportamento", schema: SCHEMA },
    maxOutputTokens: MAX_OUT,
    reasoningEffort: "medium",
  });
  await db.insert(schema.aiUsage).values({
    provider: provider.name,
    model: res.model,
    inputTokens: res.usage.inputTokens,
    cachedInputTokens: res.usage.cachedInputTokens,
    outputTokens: res.usage.outputTokens,
    costUsd: costUsd(res.model, res.usage),
    status: "ok",
    detail: "Proposta de melhoria do comportamento",
  });
  let parsed;
  try {
    parsed = Parsed.parse(JSON.parse(res.text));
  } catch {
    return { ok: false as const, error: "A IA não devolveu uma proposta válida. Tente de novo." };
  }
  const ids = feedback.map((f) => f.id);
  const [proposal] = await db
    .insert(schema.behaviorProposals)
    .values({ summary: parsed.resumo, changes: parsed.alteracoes, feedbackIds: ids })
    .returning();
  await db.update(schema.responseFeedback).set({ status: "analisada" }).where(inArray(schema.responseFeedback.id, ids));
  return { ok: true as const, proposal };
}
