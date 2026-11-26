import { and, asc, desc, eq, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getProvider } from "../ai";
import { costUsd, estimateTokens, worstCaseCostUsd } from "../ai/pricing";
import type { AIProvider, ChatMessage, ToolCall } from "../ai/types";
import { evaluateBudget, getSettings, getSpend } from "../usage/budget";
import { buildSystemPrompt } from "./prompt";
import { TOOL_DEFINITIONS, toolSchemas, type ToolName } from "./tools";

const MAX_OUTPUT_TOKENS = 1500; // inclui tokens de raciocínio
const MAX_STEPS = 4;
const HISTORY_LIMIT = 40;

export type TurnResult =
  | { status: "replied" }
  | { status: "skipped"; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "error"; reason: string };

/** Tenta reservar a conversa para a IA (evita respostas duplicadas em paralelo). */
async function claim(conversationId: string): Promise<boolean> {
  const rows = await db
    .update(schema.conversations)
    .set({ aiBusyUntil: dsql`now() + interval '2 minutes'` })
    .where(
      and(
        eq(schema.conversations.id, conversationId),
        eq(schema.conversations.aiEnabled, true),
        or(isNull(schema.conversations.aiBusyUntil), lt(schema.conversations.aiBusyUntil, dsql`now()`)),
      ),
    )
    .returning({ id: schema.conversations.id });
  return rows.length > 0;
}

async function release(conversationId: string) {
  await db.update(schema.conversations).set({ aiBusyUntil: null }).where(eq(schema.conversations.id, conversationId));
}

async function addMessage(conversationId: string, sender: "ia" | "sistema", content: string) {
  await db.insert(schema.messages).values({ conversationId, sender, content });
  await db.update(schema.conversations).set({ lastMessageAt: new Date() }).where(eq(schema.conversations.id, conversationId));
}

async function flagHuman(conversationId: string, reason: string) {
  await db
    .update(schema.conversations)
    .set({ needsHuman: true, needsHumanReason: reason })
    .where(eq(schema.conversations.id, conversationId));
}

async function loadHistory(conversationId: string): Promise<{ history: ChatMessage[]; lastPatientMessageId: string | null }> {
  const rows = await db
    .select()
    .from(schema.messages)
    .where(eq(schema.messages.conversationId, conversationId))
    .orderBy(desc(schema.messages.createdAt))
    .limit(HISTORY_LIMIT);
  rows.reverse();
  const history: ChatMessage[] = [];
  for (const m of rows) {
    if (m.sender === "paciente") history.push({ role: "user", content: m.content });
    else if (m.sender === "ia" || m.sender === "humano") history.push({ role: "assistant", content: m.content });
  }
  const last = rows.filter((m) => m.sender !== "sistema").at(-1);
  return { history, lastPatientMessageId: last?.sender === "paciente" ? last.id : null };
}

async function runTool(conversationId: string, call: ToolCall): Promise<string> {
  const name = call.name as ToolName;
  const schemaFor = toolSchemas[name];
  if (!schemaFor) return JSON.stringify({ ok: false, erro: "ferramenta desconhecida" });
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(call.arguments || "{}");
  } catch {
    return JSON.stringify({ ok: false, erro: "argumentos inválidos" });
  }
  const parsed = schemaFor.safeParse(parsedJson);
  if (!parsed.success) return JSON.stringify({ ok: false, erro: "argumentos inválidos" });

  const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId));

  if (name === "solicitar_agendamento") {
    const a = parsed.data as ReturnType<typeof toolSchemas.solicitar_agendamento.parse>;
    await db.insert(schema.appointmentRequests).values({
      conversationId,
      patientName: a.nome_paciente || null,
      procedure: a.procedimento,
      preferredPeriod: a.periodo_preferido,
      notes: a.observacoes || null,
      urgent: a.urgente,
    });
    if (a.nome_paciente) {
      await db
        .update(schema.contacts)
        .set({ name: a.nome_paciente })
        .where(and(eq(schema.contacts.id, conv.contactId), isNull(schema.contacts.name)));
    }
    return JSON.stringify({ ok: true, status: "solicitação registrada; a equipe vai confirmar o horário. NÃO confirme horário ao paciente." });
  }

  if (name === "registrar_contato") {
    const a = parsed.data as ReturnType<typeof toolSchemas.registrar_contato.parse>;
    const [contact] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, conv.contactId));
    const update: Partial<typeof schema.contacts.$inferInsert> = {};
    if (a.nome) update.name = a.nome;
    // Origem declarada não sobrescreve origem confirmada por rastreio técnico.
    if (a.origem && contact.originEvidence !== "confirmada") {
      update.origin = a.origem;
      update.originDetail = a.origem_detalhe || null;
      update.originEvidence = "declarada";
    }
    if (Object.keys(update).length) await db.update(schema.contacts).set(update).where(eq(schema.contacts.id, contact.id));
    return JSON.stringify({ ok: true });
  }

  // transferir_para_humano
  const a = parsed.data as ReturnType<typeof toolSchemas.transferir_para_humano.parse>;
  await db
    .update(schema.conversations)
    .set({ aiEnabled: false, needsHuman: true, needsHumanReason: a.motivo })
    .where(eq(schema.conversations.id, conversationId));
  await addMessage(conversationId, "sistema", `Conversa transferida para a equipe: ${a.motivo}. IA desativada nesta conversa.`);
  return JSON.stringify({ ok: true, status: "transferido; despeça-se brevemente dizendo que a equipe vai responder" });
}

async function recordUsage(v: typeof schema.aiUsage.$inferInsert) {
  await db.insert(schema.aiUsage).values(v);
}

/**
 * Gera a resposta da IA para a última mensagem do paciente.
 * Respeita: IA desativada (humano assumiu), limites de consumo e trava contra respostas duplicadas.
 */
export async function runAttendantTurn(conversationId: string, provider: AIProvider = getProvider()): Promise<TurnResult> {
  if (!provider.isConfigured()) {
    await addMessage(conversationId, "sistema", "IA não respondeu: a chave da OpenAI ainda não foi configurada.");
    return { status: "error", reason: "Chave da IA não configurada." };
  }
  if (!(await claim(conversationId))) return { status: "skipped", reason: "IA desativada ou já respondendo." };

  try {
    let { history, lastPatientMessageId } = await loadHistory(conversationId);
    if (!lastPatientMessageId) return { status: "skipped", reason: "Nada novo do paciente." };

    const system = buildSystemPrompt();
    const toolsText = JSON.stringify(TOOL_DEFINITIONS);
    const convo: ChatMessage[] = [{ role: "system", content: system }, ...history];

    for (let step = 0; step < MAX_STEPS; step++) {
      const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conversationId));
      // Humano assumiu no meio do caminho: IA não fala mais.
      if (!conv.aiEnabled && step === 0) return { status: "skipped", reason: "IA desativada." };

      const inputEstimate = estimateTokens(convo.map((m) => ("content" in m ? m.content : "")).join("\n") + toolsText);
      const budget = evaluateBudget(await getSettings(), await getSpend(), worstCaseCostUsd(provider.model, inputEstimate, MAX_OUTPUT_TOKENS));
      if (!budget.ok) {
        await recordUsage({ conversationId, provider: provider.name, model: provider.model, status: "bloqueado", detail: budget.reason });
        await addMessage(conversationId, "sistema", `IA não respondeu: ${budget.reason} A equipe precisa responder.`);
        await flagHuman(conversationId, budget.reason);
        return { status: "blocked", reason: budget.reason };
      }

      let res;
      try {
        res = await provider.chat({ messages: convo, tools: step < MAX_STEPS - 1 ? TOOL_DEFINITIONS : undefined, maxOutputTokens: MAX_OUTPUT_TOKENS });
      } catch (e) {
        const detail = e instanceof Error ? e.message.slice(0, 300) : "erro desconhecido";
        await recordUsage({ conversationId, provider: provider.name, model: provider.model, status: "erro", detail });
        await addMessage(conversationId, "sistema", "IA não respondeu por uma falha no provedor de IA. A equipe precisa responder.");
        await flagHuman(conversationId, "Falha no provedor de IA");
        return { status: "error", reason: detail };
      }

      await recordUsage({
        conversationId,
        provider: provider.name,
        model: res.model,
        inputTokens: res.usage.inputTokens,
        cachedInputTokens: res.usage.cachedInputTokens,
        outputTokens: res.usage.outputTokens,
        costUsd: costUsd(res.model, res.usage),
        status: "ok",
      });

      if (res.toolCalls.length) {
        convo.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
        for (const call of res.toolCalls) {
          convo.push({ role: "tool", toolCallId: call.id, content: await runTool(conversationId, call) });
        }
        continue;
      }

      const text = res.text.trim();
      if (!text) {
        await addMessage(conversationId, "sistema", "IA não gerou resposta. A equipe precisa responder.");
        await flagHuman(conversationId, "IA sem resposta");
        return { status: "error", reason: "Resposta vazia" };
      }

      // Se o paciente mandou algo novo enquanto a IA pensava, recomeça com o histórico atualizado.
      const fresh = await loadHistory(conversationId);
      if (fresh.lastPatientMessageId && fresh.lastPatientMessageId !== lastPatientMessageId && step < MAX_STEPS - 1) {
        ({ history, lastPatientMessageId } = fresh);
        convo.splice(1, convo.length - 1, ...history);
        continue;
      }

      await addMessage(conversationId, "ia", text);
      return { status: "replied" };
    }

    await addMessage(conversationId, "sistema", "IA não concluiu a resposta. A equipe precisa responder.");
    await flagHuman(conversationId, "IA não concluiu");
    return { status: "error", reason: "Limite de passos" };
  } finally {
    await release(conversationId);
  }
}

export async function getConversationMessages(conversationId: string) {
  return db.select().from(schema.messages).where(eq(schema.messages.conversationId, conversationId)).orderBy(asc(schema.messages.createdAt));
}
