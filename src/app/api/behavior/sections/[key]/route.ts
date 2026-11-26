import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody, sameOrigin } from "@/lib/api";
import { sectionDef } from "@/lib/attendant/behavior/defaults";
import { saveSection, sectionHistory } from "@/lib/attendant/behavior/sections";

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!sectionDef(key)) return bad("Seção não encontrada", 404);
  return NextResponse.json({ history: await sectionHistory(key) });
}

const Body = z.object({ content: z.string().trim().min(1).max(20000), note: z.string().trim().max(200).optional() });

export async function PUT(req: Request, ctx: { params: Promise<{ key: string }> }) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const { key } = await ctx.params;
  if (!sectionDef(key)) return bad("Seção não encontrada", 404);
  const body = await parseBody(req, Body);
  if (!body) return bad("Conteúdo inválido (máximo 20.000 caracteres).");
  await saveSection(key, body.content, body.note || "Editado no painel");
  return NextResponse.json({ ok: true });
}
