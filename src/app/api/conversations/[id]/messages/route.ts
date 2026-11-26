import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin, UUID_RE } from "@/lib/api";
import { runAttendantTurn } from "@/lib/attendant/engine";
import { getConversationDetail } from "@/lib/data";

export const maxDuration = 60;

const Body = z.object({
  content: z.string().trim().min(1).max(2000),
  as: z.enum(["paciente", "humano"]),
});

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Conversa não encontrada", 404);
  const body = await parseBody(req, Body);
  if (!body) return bad("Mensagem inválida");

  const [conv] = await db.select().from(schema.conversations).where(eq(schema.conversations.id, id));
  if (!conv) return bad("Conversa não encontrada", 404);

  await db.insert(schema.messages).values({ conversationId: id, sender: body.as, content: body.content });

  if (body.as === "humano") {
    // Humano respondeu: assume a conversa e desliga a IA até reativação explícita.
    await db
      .update(schema.conversations)
      .set({ aiEnabled: false, needsHuman: false, needsHumanReason: null, lastMessageAt: new Date() })
      .where(eq(schema.conversations.id, id));
    if (conv.aiEnabled) {
      await db.insert(schema.messages).values({ conversationId: id, sender: "sistema", content: "Equipe assumiu a conversa. IA desativada até ser reativada." });
    }
  } else {
    await db
      .update(schema.conversations)
      .set(
        conv.aiEnabled
          ? { lastMessageAt: new Date() }
          : { lastMessageAt: new Date(), needsHuman: true, needsHumanReason: "Paciente aguardando resposta da equipe" },
      )
      .where(eq(schema.conversations.id, id));
  }

  let ai: Awaited<ReturnType<typeof runAttendantTurn>> | null = null;
  if (body.as === "paciente" && conv.aiEnabled) ai = await runAttendantTurn(id);

  return NextResponse.json({ ai, detail: await getConversationDetail(id) });
}
