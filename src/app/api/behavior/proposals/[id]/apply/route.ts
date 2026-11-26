import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin, UUID_RE } from "@/lib/api";
import { saveSection } from "@/lib/attendant/behavior/sections";

/** Aplica UMA alteração de uma proposta, por decisão explícita de uma pessoa. */
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Proposta não encontrada", 404);
  const body = await parseBody(req, z.object({ index: z.number().int().min(0).max(10) }));
  if (!body) return bad("Dados inválidos");
  const [p] = await db.select().from(schema.behaviorProposals).where(eq(schema.behaviorProposals.id, id));
  const change = p?.changes[body.index];
  if (!p || !change) return bad("Alteração não encontrada", 404);
  if (change.aplicada) return bad("Esta alteração já foi aplicada.");
  await saveSection(change.secao, change.novo_conteudo, "Aplicado a partir de proposta de melhoria");
  const changes = p.changes.map((c, i) => (i === body.index ? { ...c, aplicada: true } : c));
  await db.update(schema.behaviorProposals).set({ changes }).where(eq(schema.behaviorProposals.id, id));
  return NextResponse.json({ ok: true });
}
