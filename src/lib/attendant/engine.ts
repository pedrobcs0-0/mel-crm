import { and, asc, desc, eq, isNull, lt, or, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { MessageMeta } from "@/db/schema";
import { getProvider } from "../ai";
import { costUsd, estimateTokens, worstCaseCostUsd } from "../ai/pricing";
import type { AIProvider, ChatMessage, ChatResponse } from "../ai/types";
import { evaluateBudget, getSettings, getSpend } from "../usage/budget";
import { loadSections } from "./behavior/sections";
import { buildContextMessage, buildSystemPrompt } from "./prompt";
import { AttendantResponse, polishMessage, RESPONSE_JSON_SCHEMA } from "./response";

const MAX_OUTPUT_TOKENS = 4000; // inclui raciocínio interno do modelo + JSON
const HISTORY_LIMIT = 40;
const MAX_ATTEMPTS = 3; // 1 normal + reprocesso se o paciente mandar algo novo ou o JSON vier inválido

export type TurnResult =
  | { status: "replied" }
  | { status: "silent"; reason: string }
  | { status: "skipped"; reason: string }
  | { status: "blocked"; reason: string }
  | { status: "error"; reason: string };

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

async function addMessage(conversationId: string, sender: "ia" | "sistema", content: string, meta?: MessageMeta) {
  await db.insert(schema.messages).values({ conversationId, sender, content, meta });
  await db.update(schema.conversations).set({ lastMessageAt: new Date() }).where(eq(schema.conversations.id, conversationId));
}

async function flagHuman(conversationId: string, reason: string) {
  await db.update(schema.conversations).set({ needsHuman: true, needsHumanReason: reason }).where(eq(schema.conversations.id, conversationId));
}

async function loadState(conversationId: string) {
  const [row] = await db
    .select({ conversation: schema.conversations, contact: schema.contacts })
    .from(schema.conversations)
    .innerJoin(schema.contacts, eq(schema.contacts.id, schema.conversations.contactId))
    .where(eq(schema.conversations.id, conversationId));
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
    else if (m.sender === "ia") history.push({ role: "assistant", content: m.content });
    else if (m.sender === "humano") history.push({ role: "assistant", content: `[Mensagem enviada por uma pessoa da equipe] ${m.content}` });
  }
  const last = rows.filter((m) => m.sender !== "sistema").at(-1);
  const [requests, events] = await Promise.all([
    db.select().from(schema.appointmentRequests).where(eq(schema.appointmentRequests.conversationId, conversationId)).orderBy(asc(schema.appointmentRequests.createdAt)),
    db.select().from(schema.crmEvents).where(eq(schema.crmEvents.contactId, row.contact.id)).orderBy(asc(schema.crmEvents.createdAt)).limit(20),
  ]);
  return {
    ...row,
    history,
    requests,
    events,
    isFirstReply: !rows.some((m) => m.sender === "ia" || m.sender === "humano"),
    lastPatientMessageId: last?.sender === "paciente" ? last.id : null,
  };
}
type State = Awaited<ReturnType<typeof loadState>>;

/** Aplica as ações de CRM. Retorna descrições curtas para mostrar no laboratório. */
async function applyActions(state: State, r: AttendantResponse): Promise<string[]> {
  const done: string[] = [];
  const { contact, conversation } = state;
  const a = r.acoes;

  const contactUpdate: Partial<typeof schema.contacts.$inferInsert> = {};
  if (a.contato?.nome) contactUpdate.name = a.contato.nome;
  if (a.contato?.origem && contact.originEvidence !== "confirmada") {
    contactUpdate.origin = a.contato.origem;
    contactUpdate.originDetail = a.contato.origem_detalhe || null;
    contactUpdate.originEvidence = "declarada";
  }
  if (a.memoria) contactUpdate.summary = a.memoria;
  if (Object.keys(contactUpdate).length) {
    await db.update(schema.contacts).set(contactUpdate).where(eq(schema.contacts.id, contact.id));
    if (contactUpdate.name) done.push(`nome: ${contactUpdate.name}`);
    if (contactUpdate.origin) done.push(`origem declarada: ${contactUpdate.origin}`);
    if (contactUpdate.summary) done.push("memória atualizada");
  }

  const ag = a.solicitar_agendamento;
  if (ag) {
    const values = {
      patientName: ag.nome_paciente || contact.name || null,
      procedure: ag.procedimento,
      preferredPeriod: ag.periodo_preferido,
      notes: ag.observacoes || null,
      urgent: ag.urgente,
    };
    const pending = state.requests.find((x) => x.status === "pendente");
    if (pending) {
      await db.update(schema.appointmentRequests).set(values).where(eq(schema.appointmentRequests.id, pending.id));
      done.push("solicitação de agendamento atualizada");
    } else {
      await db.insert(schema.appointmentRequests).values({ conversationId: conversation.id, ...values });
      done.push(ag.urgente ? "solicitação de agendamento URGENTE" : "solicitação de agendamento");
    }
  }

  // Evita registros duplicados: uma objeção por categoria e uma oportunidade (atualizada) por conversa.
  const sameConv = state.events.filter((e) => e.conversationId === conversation.id);
  if (a.objecao && !sameConv.some((e) => e.type === "objecao" && e.category === a.objecao!.tipo)) {
    await db.insert(schema.crmEvents).values({ contactId: contact.id, conversationId: conversation.id, type: "objecao", category: a.objecao.tipo, description: a.objecao.descricao });
    done.push(`objeção: ${a.objecao.tipo}`);
  }
  if (a.oportunidade) {
    const existing = sameConv.find((e) => e.type === "oportunidade");
    if (existing) {
      await db.update(schema.crmEvents).set({ description: a.oportunidade.motivo, when: a.oportunidade.quando }).where(eq(schema.crmEvents.id, existing.id));
    } else {
      await db.insert(schema.crmEvents).values({ contactId: contact.id, conversationId: conversation.id, type: "oportunidade", description: a.oportunidade.motivo, when: a.oportunidade.quando });
      done.push("oportunidade de acompanhamento");
    }
  }
  if (a.pendencia_equipe) {
    await flagHuman(conversation.id, `Pergunta para a equipe: ${a.pendencia_equipe.pergunta}`);
    done.push("pendência para a equipe");
  }

  const urg = r.analise.urgencia;
  if ((urg === "urgente" || urg === "grave") && !state.conversation.needsHuman) {
    await flagHuman(conversation.id, urg === "grave" ? "Possível urgência GRAVE: verificar agora" : "Possível urgência: verificar encaixe");
    done.push(`urgência: ${urg}`);
  }
  return done;
}

async function transfer(conversationId: string, motivo: string) {
  await db.update(schema.conversations).set({ aiEnabled: false, needsHuman: true, needsHumanReason: motivo }).where(eq(schema.conversations.id, conversationId));
  await addMessage(conversationId, "sistema", `Conversa transferida para a equipe: ${motivo}. IA desativada nesta conversa.`);
}

function parse(res: ChatResponse): AttendantResponse | null {
  if (res.refusal) return null;
  try {
    // Remove caracteres de controle inválidos (ex.: \u0000), que o Postgres recusa.
    const r = AttendantResponse.safeParse(JSON.parse(res.text, (_k, v) => (typeof v === "string" ? v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "") : v)));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/**
 * Gera a resposta da IA para a(s) última(s) mensagem(ns) do paciente.
 * Uma única chamada ao modelo devolve análise interna + mensagens + ações de CRM.
 */
export async function runAttendantTurn(conversationId: string, provider: AIProvider = getProvider()): Promise<TurnResult> {
  if (!provider.isConfigured()) {
    await addMessage(conversationId, "sistema", "IA não respondeu: a chave da OpenAI ainda não foi configurada.");
    return { status: "error", reason: "Chave da IA não configurada." };
  }
  if (!(await claim(conversationId))) return { status: "skipped", reason: "IA desativada ou já respondendo." };

  try {
    const system = buildSystemPrompt(await loadSections());
    let state = await loadState(conversationId);
    if (!state.lastPatientMessageId) return { status: "skipped", reason: "Nada novo do paciente." };

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      const convo: ChatMessage[] = [
        { role: "system", content: system },
        ...state.history,
        { role: "system", content: buildContextMessage(state) },
      ];

      const inputEstimate = estimateTokens(convo.map((m) => ("content" in m ? m.content : "")).join("\n") + JSON.stringify(RESPONSE_JSON_SCHEMA));
      const budget = evaluateBudget(await getSettings(), await getSpend(), worstCaseCostUsd(provider.model, inputEstimate, MAX_OUTPUT_TOKENS));
      if (!budget.ok) {
        await db.insert(schema.aiUsage).values({ conversationId, provider: provider.name, model: provider.model, status: "bloqueado", detail: budget.reason });
        await addMessage(conversationId, "sistema", `IA não respondeu: ${budget.reason} A equipe precisa responder.`);
        await flagHuman(conversationId, budget.reason);
        return { status: "blocked", reason: budget.reason };
      }

      let res: ChatResponse;
      try {
        res = await provider.chat({ messages: convo, jsonSchema: { name: "resposta_atendente", schema: RESPONSE_JSON_SCHEMA }, maxOutputTokens: MAX_OUTPUT_TOKENS });
      } catch (e) {
        const detail = e instanceof Error ? e.message.slice(0, 300) : "erro desconhecido";
        await db.insert(schema.aiUsage).values({ conversationId, provider: provider.name, model: provider.model, status: "erro", detail });
        await addMessage(conversationId, "sistema", "IA não respondeu por uma falha no provedor de IA. A equipe precisa responder.");
        await flagHuman(conversationId, "Falha no provedor de IA");
        return { status: "error", reason: detail };
      }

      const parsed = parse(res);
      await db.insert(schema.aiUsage).values({
        conversationId,
        provider: provider.name,
        model: res.model,
        inputTokens: res.usage.inputTokens,
        cachedInputTokens: res.usage.cachedInputTokens,
        outputTokens: res.usage.outputTokens,
        costUsd: costUsd(res.model, res.usage),
        status: parsed ? "ok" : "erro",
        detail: parsed ? null : "Resposta fora do formato esperado",
      });
      if (!parsed) continue; // tenta de novo

      // Paciente mandou algo novo enquanto a IA pensava: recomeça com o histórico atualizado.
      const fresh = await loadState(conversationId);
      if (!fresh.conversation.aiEnabled) return { status: "skipped", reason: "Equipe assumiu durante a resposta." };
      if (fresh.lastPatientMessageId !== state.lastPatientMessageId && attempt < MAX_ATTEMPTS - 1) {
        state = fresh;
        continue;
      }

      const actions = await applyActions(state, parsed);
      const texts = parsed.mensagens.map(polishMessage).filter(Boolean).slice(0, 2);
      const meta: MessageMeta = { analise: parsed.analise, acoes: actions };
      for (let i = 0; i < texts.length; i++) await addMessage(conversationId, "ia", texts[i], i === 0 ? meta : undefined);
      if (!texts.length) await addMessage(conversationId, "sistema", "A IA analisou e optou por não responder.", meta);
      if (parsed.acoes.transferir) await transfer(conversationId, parsed.acoes.transferir.motivo);
      return texts.length ? { status: "replied" } : { status: "silent", reason: "Sem resposta necessária" };
    }

    await addMessage(conversationId, "sistema", "IA não conseguiu gerar uma resposta válida. A equipe precisa responder.");
    await flagHuman(conversationId, "IA sem resposta válida");
    return { status: "error", reason: "Resposta inválida" };
  } finally {
    await release(conversationId);
  }
}
