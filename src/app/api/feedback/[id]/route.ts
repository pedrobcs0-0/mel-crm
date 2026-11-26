import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin, UUID_RE } from "@/lib/api";
import { loadSections, saveSection } from "@/lib/attendant/behavior/sections";

const Body = z.object({ action: z.enum(["descartar", "reabrir", "usar_como_exemplo"]) });

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const { id } = await ctx.params;
  if (!UUID_RE.test(id)) return bad("Correção não encontrada", 404);
  const body = await parseBody(req, Body);
  if (!body) return bad("Dados inválidos");
  const [fb] = await db.select().from(schema.responseFeedback).where(eq(schema.responseFeedback.id, id));
  if (!fb) return bad("Correção não encontrada", 404);

  if (body.action === "usar_como_exemplo") {
    if (!fb.betterResponse) return bad("Esta correção não tem uma resposta melhor escrita.");
    const ex = (await loadSections()).find((s) => s.key === "exemplos")!;
    const lastPatient = fb.context.split("\n").reverse().find((l) => l.startsWith("Paciente:")) ?? "";
    const entry = `\n\nExemplo (correção do laboratório; referência de raciocínio, não roteiro):\n${lastPatient}\nRuim: "${fb.badResponse}"\nPor quê: ${fb.reason}\nMelhor: "${fb.betterResponse}"`;
    await saveSection("exemplos", ex.content.trim() + entry, "Exemplo adicionado a partir de correção do laboratório");
    await db.update(schema.responseFeedback).set({ status: "analisada" }).where(eq(schema.responseFeedback.id, id));
  } else {
    await db.update(schema.responseFeedback).set({ status: body.action === "descartar" ? "descartada" : "nova" }).where(eq(schema.responseFeedback.id, id));
  }
  return NextResponse.json({ ok: true });
}
