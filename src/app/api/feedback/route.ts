import { NextResponse } from "next/server";
import { and, asc, eq, lte } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin } from "@/lib/api";

const Body = z.object({
  messageId: z.string().uuid(),
  reason: z.string().trim().min(3).max(2000),
  betterResponse: z.string().trim().max(2000).optional(),
});

const LABEL = { paciente: "Paciente", ia: "Atendente", humano: "Equipe", sistema: "Sistema" } as const;

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const body = await parseBody(req, Body);
  if (!body) return bad("Descreva o motivo (mínimo 3 caracteres).");
  const [msg] = await db.select().from(schema.messages).where(eq(schema.messages.id, body.messageId));
  if (!msg || msg.sender !== "ia") return bad("Só é possível avaliar respostas da atendente", 404);

  const prior = await db
    .select()
    .from(schema.messages)
    .where(and(eq(schema.messages.conversationId, msg.conversationId), lte(schema.messages.createdAt, msg.createdAt)))
    .orderBy(asc(schema.messages.createdAt));
  const context = prior
    .filter((m) => m.sender !== "sistema" && m.id !== msg.id)
    .slice(-12)
    .map((m) => `${LABEL[m.sender]}: ${m.content}`)
    .join("\n");

  await db.insert(schema.responseFeedback).values({
    messageId: msg.id,
    conversationId: msg.conversationId,
    context,
    badResponse: msg.content,
    reason: body.reason,
    betterResponse: body.betterResponse || null,
  });
  return NextResponse.json({ ok: true });
}
