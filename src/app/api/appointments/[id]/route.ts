import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin, UUID_RE } from "@/lib/api";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Solicitação não encontrada", 404);
  const body = await parseBody(req, z.object({ status: z.enum(["pendente", "confirmada", "recusada"]) }));
  if (!body) return bad("Dados inválidos");
  const rows = await db.update(schema.appointmentRequests).set({ status: body.status }).where(eq(schema.appointmentRequests.id, id)).returning();
  if (!rows.length) return bad("Solicitação não encontrada", 404);
  return NextResponse.json({ ok: true });
}
