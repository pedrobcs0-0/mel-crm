import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, sql } from "@/db";
import { MockProvider } from "@/lib/ai/mock";
import type { AIProvider, ChatRequest, ChatResponse } from "@/lib/ai/types";
import { runAttendantTurn } from "@/lib/attendant/engine";
import type { AttendantResponse } from "@/lib/attendant/response";

// Usa um banco separado de testes.
if (!process.env.DATABASE_URL?.includes("mel_test")) throw new Error("Rode com DATABASE_URL apontando para mel_test");

async function newConversation(text: string, origin?: Partial<typeof schema.contacts.$inferInsert>) {
  const [c] = await db.insert(schema.contacts).values({ phone: "+55 65 90000-0000", ...origin }).returning();
  const [conv] = await db.insert(schema.conversations).values({ contactId: c.id }).returning();
  await db.insert(schema.messages).values({ conversationId: conv.id, sender: "paciente", content: text });
  return { conv, contact: c };
}

const msgs = (id: string) => db.select().from(schema.messages).where(eq(schema.messages.conversationId, id)).orderBy(schema.messages.createdAt);

class ScriptedProvider implements AIProvider {
  name = "test";
  model = "gpt-5-mini";
  calls: ChatRequest[] = [];
  constructor(private script: ((req: ChatRequest) => ChatResponse)[]) {}
  isConfigured() {
    return true;
  }
  async chat(req: ChatRequest) {
    this.calls.push(req);
    return this.script.shift()!(req);
  }
}
const usage = { inputTokens: 1000, cachedInputTokens: 0, outputTokens: 100 };

type Acoes = Partial<AttendantResponse["acoes"]>;
function reply(mensagens: string[], acoes: Acoes = {}, analise: Partial<AttendantResponse["analise"]> = {}) {
  return (): ChatResponse => ({
    text: JSON.stringify({
      analise: {
        intencao: "x",
        momento: "abertura",
        perfil: "indefinido",
        urgencia: "nenhuma",
        ja_sabemos: "",
        relevante_descobrir: "nada",
        objecao_ou_duvida: null,
        paciente_pediu_valor: false,
        proxima_intervencao: "responder",
        deve_perguntar: false,
        ...analise,
      },
      mensagens,
      acoes: { contato: null, memoria: null, solicitar_agendamento: null, objecao: null, oportunidade: null, pendencia_equipe: null, transferir: null, ...acoes },
    }),
    toolCalls: [],
    usage,
    model: "gpt-5-mini",
  });
}

beforeEach(async () => {
  await sql`truncate response_feedback, behavior_proposals, crm_events, prompt_sections, prompt_section_versions, ai_usage, appointment_requests, messages, conversations, contacts, settings cascade`;
  await sql`insert into settings (id, daily_limit_usd, monthly_limit_usd) values (1, 1, 10)`;
});
afterAll(async () => {
  await sql.end();
});

describe("atendente", () => {
  it("responde e registra custo", async () => {
    const { conv } = await newConversation("Oi");
    const r = await runAttendantTurn(conv.id, new MockProvider());
    expect(r.status).toBe("replied");
    const m = await msgs(conv.id);
    expect(m.at(-1)?.sender).toBe("ia");
    const u = await db.select().from(schema.aiUsage);
    expect(u).toHaveLength(1);
    expect(u[0].costUsd).toBeGreaterThan(0);
  });

  it("não responde quando humano assumiu", async () => {
    const { conv } = await newConversation("Oi");
    await db.update(schema.conversations).set({ aiEnabled: false }).where(eq(schema.conversations.id, conv.id));
    const r = await runAttendantTurn(conv.id, new MockProvider());
    expect(r.status).toBe("skipped");
    expect((await msgs(conv.id)).filter((m) => m.sender === "ia")).toHaveLength(0);
  });

  it("não responde duas vezes à mesma mensagem", async () => {
    const { conv } = await newConversation("Oi");
    await runAttendantTurn(conv.id, new MockProvider());
    const r = await runAttendantTurn(conv.id, new MockProvider());
    expect(r.status).toBe("skipped");
  });

  it("bloqueia ao atingir o limite e marca para a equipe", async () => {
    await db.insert(schema.aiUsage).values({ provider: "x", model: "gpt-5-mini", costUsd: 0.9999, status: "ok" });
    const { conv } = await newConversation("Oi");
    const p = new ScriptedProvider([]);
    const r = await runAttendantTurn(conv.id, p);
    expect(r.status).toBe("blocked");
    expect(p.calls).toHaveLength(0);
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.needsHuman).toBe(true);
  });

  it("solicitação de agendamento fica pendente (nunca confirmada pela IA)", async () => {
    const { conv } = await newConversation("quero agendar uma avaliação de manhã");
    const r = await runAttendantTurn(conv.id, new MockProvider());
    expect(r.status).toBe("replied");
    const reqs = await db.select().from(schema.appointmentRequests);
    expect(reqs).toHaveLength(1);
    expect(reqs[0].status).toBe("pendente");
    expect(await db.select().from(schema.aiUsage)).toHaveLength(1); // uma única chamada por turno
  });

  it("origem declarada não sobrescreve origem confirmada", async () => {
    const { conv, contact } = await newConversation("vi no google", { origin: "instagram", originEvidence: "confirmada" });
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Obrigada!"], { contato: { nome: "Ana", origem: "google", origem_detalhe: null } })]));
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id));
    expect(c.name).toBe("Ana");
    expect(c.origin).toBe("instagram");
    expect(c.originEvidence).toBe("confirmada");
  });

  it("registra origem declarada e memória", async () => {
    const { conv, contact } = await newConversation("minha amiga indicou");
    await runAttendantTurn(
      conv.id,
      new ScriptedProvider([reply(["Que bom!"], { contato: { nome: null, origem: "indicacao", origem_detalhe: "amiga Carla" }, memoria: "Quer clareamento." })]),
    );
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id));
    expect(c.originEvidence).toBe("declarada");
    expect(c.origin).toBe("indicacao");
    expect(c.summary).toBe("Quer clareamento.");
  });

  it("transferir para humano desativa a IA depois de enviar a mensagem", async () => {
    const { conv } = await newConversation("quero falar com uma pessoa");
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Claro, a equipe já vai te responder."], { transferir: { motivo: "pediu atendente" } })]));
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.aiEnabled).toBe(false);
    expect(c.needsHuman).toBe(true);
    expect(c.aiBusyUntil).toBeNull();
    expect((await msgs(conv.id)).some((m) => m.sender === "ia")).toBe(true);
  });

  it("pendência para a equipe avisa sem desligar a IA", async () => {
    const { conv } = await newConversation("a limpeza inclui flúor?");
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Vou confirmar com a equipe."], { pendencia_equipe: { pergunta: "Limpeza inclui flúor?" } })]));
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.aiEnabled).toBe(true);
    expect(c.needsHuman).toBe(true);
  });

  it("não duplica objeções nem oportunidades na mesma conversa", async () => {
    const { conv, contact } = await newConversation("achei caro");
    const obj = { objecao: { tipo: "preco" as const, descricao: "achou caro" }, oportunidade: { motivo: "pode voltar", quando: null } };
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Tudo bem."], obj)]));
    await db.insert(schema.messages).values({ conversationId: conv.id, sender: "paciente", content: "vou pesquisar" });
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Fica à vontade."], { ...obj, oportunidade: { motivo: "vai pesquisar", quando: "semana que vem" } })]));
    const ev = await db.select().from(schema.crmEvents).where(eq(schema.crmEvents.contactId, contact.id));
    expect(ev.filter((e) => e.type === "objecao")).toHaveLength(1);
    const op = ev.filter((e) => e.type === "oportunidade");
    expect(op).toHaveLength(1);
    expect(op[0].when).toBe("semana que vem");
  });

  it("urgência marca a conversa para a equipe", async () => {
    const { conv } = await newConversation("dor forte");
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Vou pedir um encaixe."], {}, { urgencia: "urgente" })]));
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.needsHuman).toBe(true);
  });

  it("pode optar por não responder", async () => {
    const { conv } = await newConversation("ok");
    const r = await runAttendantTurn(conv.id, new ScriptedProvider([reply([])]));
    expect(r.status).toBe("silent");
    expect((await msgs(conv.id)).filter((m) => m.sender === "ia")).toHaveLength(0);
  });

  it("remove emojis e travessões e divide em no máximo 2 mensagens", async () => {
    const { conv } = await newConversation("oi");
    await runAttendantTurn(conv.id, new ScriptedProvider([reply(["Oi! 😊 Sou a assistente — tudo certo.", "Segunda.", "Terceira."])]));
    const ia = (await msgs(conv.id)).filter((m) => m.sender === "ia");
    expect(ia.map((m) => m.content)).toEqual(["Oi! Sou a assistente, tudo certo.", "Segunda."]);
    expect(ia[0].meta?.analise).toBeTruthy();
  });

  it("JSON inválido tenta de novo e depois avisa a equipe", async () => {
    const { conv } = await newConversation("oi");
    const bad = (): ChatResponse => ({ text: "{lixo", toolCalls: [], usage, model: "gpt-5-mini" });
    const r = await runAttendantTurn(conv.id, new ScriptedProvider([bad, bad, bad]));
    expect(r.status).toBe("error");
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.needsHuman).toBe(true);
  });

  it("usa a versão editada das instruções", async () => {
    await db.insert(schema.promptSections).values({ key: "instrucoes", content: "INSTRUCAO-EDITADA-XYZ" });
    const { conv } = await newConversation("oi");
    const p = new ScriptedProvider([reply(["Oi!"])]);
    await runAttendantTurn(conv.id, p);
    const system = p.calls[0].messages[0];
    expect("content" in system && system.content).toContain("INSTRUCAO-EDITADA-XYZ");
    expect("content" in system && system.content).toContain("Regras críticas");
  });

  it("falha do provedor vira aviso para a equipe e libera a trava", async () => {
    const { conv } = await newConversation("oi");
    const p = new ScriptedProvider([
      () => {
        throw new Error("timeout");
      },
    ]);
    expect((await runAttendantTurn(conv.id, p)).status).toBe("error");
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.needsHuman).toBe(true);
    expect(c.aiBusyUntil).toBeNull();
  });
});
