import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin, UUID_RE } from "@/lib/api";
import { getConversationDetail } from "@/lib/data";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Conversa não encontrada", 404);
  const body = await parseBody(req, z.object({ enabled: z.boolean() }));
  if (!body) return bad("Dados inválidos");

  const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
  if (!conv) return bad("Conversa não encontrada", 404);
  if (conv.aiEnabled !== body.enabled) {
    await db
      .update(schema.conversations)
      .set(body.enabled ? { aiEnabled: true, needsHuman: false, needsHumanReason: null } : { aiEnabled: false })
      .where(eq(schema.conversations.id, id));
    await db.insert(schema.messages).values({
      conversationId: id,
      sender: "sistema",
      content: body.enabled ? "IA reativada pela equipe." : "Equipe assumiu a conversa. IA desativada até ser reativada.",
    });
  }
  return NextResponse.json({ detail: await getConversationDetail(id) });
}
