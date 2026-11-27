import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, sameOrigin, parseBody } from "@/lib/api";
import { getProvider } from "@/lib/ai";
import { costUsd, estimateTokens, worstCaseCostUsd } from "@/lib/ai/pricing";
import type { ChatMessage } from "@/lib/ai/types";
import { getSpend, evaluateBudget } from "@/lib/usage/budget";
import { loadSections } from "@/lib/attendant/behavior/sections";
import { OUTPUT_CONTRACT, PROTECTED_RULES } from "@/lib/attendant/behavior/protected";
import { buildSystemPrompt } from "@/lib/attendant/prompt";
import { buildSystemPromptB } from "@/lib/attendant/prompt-b";
import { buildLabContext } from "@/lib/attendant/ab-lab";
import { AttendantResponse, RESPONSE_JSON_SCHEMA, polishMessage } from "@/lib/attendant/response";

export const maxDuration = 60;
const Body = z.object({
  variant: z.enum(["A", "B"]),
  patient: z.string().trim().min(1).max(2000),
  turns: z.array(z.object({ patient: z.string().max(2000), reply: AttendantResponse })).max(20),
  snapshot: z.string().length(64).optional(),
  now: z.string().datetime(),
});
export async function POST(req: Request) {
  // Off by default; no changes to the normal CRM. Never use in production.
  if (process.env.MEL_AB_LAB_ENABLED !== "1" || process.env.VERCEL_ENV === "production")
    return bad("Comparação desativada neste ambiente.", 403);
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const body = await parseBody(req, Body);
  if (!body) return bad("Dados de teste inválidos.");
  if (body.turns.some(t => t.reply.acoes.transferir)) return bad("Atendimento transferido. Inicie um novo teste.");
  const provider = getProvider();
  if (!provider.isConfigured() || provider.name !== "openai" || provider.model !== "gpt-5-mini")
    return bad("O laboratório exige GPT-5 mini configurado.", 503);
  const sections = await loadSections();
  const a = buildSystemPrompt(sections);
  const b = buildSystemPromptB(sections, {protectedRules: PROTECTED_RULES, outputContract: OUTPUT_CONTRACT, automationNoticeShown: false});
  const snapshot = createHash("sha256").update(JSON.stringify({a,b,schema: RESPONSE_JSON_SCHEMA, model:provider.model, effort:"medium"})).digest("hex");
  if (body.snapshot && body.snapshot !== snapshot)
    return bad("As instruções mudaram desde o início do teste. Exporte e inicie outro.", 409);
  const {history, context} = buildLabContext(body.turns, new Date(body.now));
  const messages: ChatMessage[] = [{role:"system",content:body.variant === "A" ? a : b}, ...history, {role:"user",content:body.patient}, {role:"system",content:context}];
  const [settings] = await db.select().from(schema.settings).limit(1);
  if (!settings) return bad("Configure o limite de consumo primeiro.", 503);
  const estimate = estimateTokens(JSON.stringify(messages)+JSON.stringify(RESPONSE_JSON_SCHEMA));
  const budget = evaluateBudget(settings, await getSpend(), worstCaseCostUsd(provider.model, estimate, 4000));
  if (!budget.ok) return bad(budget.reason, 429);
  const start = Date.now();
  try {
    const res = await provider.chat({messages,jsonSchema:{name:"resposta_atendente",schema:RESPONSE_JSON_SCHEMA},maxOutputTokens:4000,reasoningEffort:"medium"});
    const usd = costUsd(res.model,res.usage);
    let reply: AttendantResponse | null = null;
    try {
      if (!res.refusal) {
        const result = AttendantResponse.safeParse(JSON.parse(res.text));
        if (result.success) reply = {...result.data,mensagens:result.data.mensagens.map(polishMessage).filter(Boolean).slice(0,2)};
      }
    } catch { /* invalid output is recorded; no automatic retry */ }
    await db.insert(schema.aiUsage).values({provider:provider.name,model:res.model,inputTokens:res.usage.inputTokens,
      cachedInputTokens:res.usage.cachedInputTokens,outputTokens:res.usage.outputTokens,costUsd:usd,
      status:reply?"ok":"erro",detail:"Laboratório A/B (sem ações reais)"});
    if (!reply) return NextResponse.json({error:"Resposta inválida do modelo. Sem reenvio automático.",usd, snapshot},{status:502});
    return NextResponse.json({reply,usd,ms:Date.now()-start,model:res.model,snapshot});
  } catch {
    // Do not retry uncertain sends or claim that they were free.
    await db.insert(schema.aiUsage).values({provider:provider.name,model:provider.model,status:"erro",detail:"Laboratório A/B: falha; custo possivelmente incerto"}).catch(()=>{});
    return bad("Falha na chamada ou no registro de consumo. Não houve reenvio automático.",502);
  }
}
