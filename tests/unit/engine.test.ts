import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db, schema, sql } from "@/db";
import { MockProvider } from "@/lib/ai/mock";
import type { AIProvider, ChatRequest, ChatResponse } from "@/lib/ai/types";
import { runAttendantTurn } from "@/lib/attendant/engine";

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

beforeEach(async () => {
  await sql`truncate ai_usage, appointment_requests, messages, conversations, contacts, settings cascade`;
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
    expect(await db.select().from(schema.aiUsage)).toHaveLength(2);
  });

  it("origem declarada não sobrescreve origem confirmada", async () => {
    const { conv, contact } = await newConversation("vi no google", { origin: "instagram", originEvidence: "confirmada" });
    const p = new ScriptedProvider([
      () => ({ text: "", toolCalls: [{ id: "1", name: "registrar_contato", arguments: JSON.stringify({ nome: "Ana", origem: "google" }) }], usage, model: "gpt-5-mini" }),
      () => ({ text: "Obrigada, Ana!", toolCalls: [], usage, model: "gpt-5-mini" }),
    ]);
    await runAttendantTurn(conv.id, p);
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id));
    expect(c.name).toBe("Ana");
    expect(c.origin).toBe("instagram");
    expect(c.originEvidence).toBe("confirmada");
  });

  it("registra origem declarada", async () => {
    const { conv, contact } = await newConversation("minha amiga indicou");
    const p = new ScriptedProvider([
      () => ({ text: "", toolCalls: [{ id: "1", name: "registrar_contato", arguments: JSON.stringify({ origem: "indicacao", origem_detalhe: "amiga Carla" }) }], usage, model: "gpt-5-mini" }),
      () => ({ text: "Que bom!", toolCalls: [], usage, model: "gpt-5-mini" }),
    ]);
    await runAttendantTurn(conv.id, p);
    const [c] = await db.select().from(schema.contacts).where(eq(schema.contacts.id, contact.id));
    expect(c.originEvidence).toBe("declarada");
    expect(c.origin).toBe("indicacao");
  });

  it("transferir para humano desativa a IA", async () => {
    const { conv } = await newConversation("quero falar com uma pessoa");
    const p = new ScriptedProvider([
      () => ({ text: "", toolCalls: [{ id: "1", name: "transferir_para_humano", arguments: JSON.stringify({ motivo: "pediu atendente" }) }], usage, model: "gpt-5-mini" }),
      () => ({ text: "Claro, já chamo alguém da equipe.", toolCalls: [], usage, model: "gpt-5-mini" }),
    ]);
    await runAttendantTurn(conv.id, p);
    const [c] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, conv.id));
    expect(c.aiEnabled).toBe(false);
    expect(c.needsHuman).toBe(true);
    expect(c.aiBusyUntil).toBeNull();
  });

  it("argumentos inválidos de ferramenta não quebram", async () => {
    const { conv } = await newConversation("oi");
    const p = new ScriptedProvider([
      () => ({ text: "", toolCalls: [{ id: "1", name: "solicitar_agendamento", arguments: "{lixo" }], usage, model: "gpt-5-mini" }),
      () => ({ text: "Pode me dizer o melhor período?", toolCalls: [], usage, model: "gpt-5-mini" }),
    ]);
    expect((await runAttendantTurn(conv.id, p)).status).toBe("replied");
    expect(await db.select().from(schema.appointmentRequests)).toHaveLength(0);
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
