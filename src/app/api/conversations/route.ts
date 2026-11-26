import { NextResponse } from "next/server";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin } from "@/lib/api";

const ORIGINS = {
  desconhecida: { origin: null, originDetail: null, originEvidence: "desconhecida" },
  anuncio_instagram: { origin: "instagram", originDetail: "Anúncio clique-para-WhatsApp (simulado)", originEvidence: "confirmada" },
  anuncio_facebook: { origin: "facebook", originDetail: "Anúncio clique-para-WhatsApp (simulado)", originEvidence: "confirmada" },
  link_site: { origin: "google", originDetail: "Link rastreado do site/Google (simulado)", originEvidence: "confirmada" },
} as const;

const Body = z.object({
  name: z.string().trim().max(120).optional(),
  simulatedOrigin: z.enum(["desconhecida", "anuncio_instagram", "anuncio_facebook", "link_site"]).default("desconhecida"),
});

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const body = await parseBody(req, Body);
  if (!body) return bad("Dados inválidos");
  const phone = `+55 65 9${Math.floor(1000 + Math.random() * 8999)}-${Math.floor(1000 + Math.random() * 8999)}`;
  const [contact] = await db
    .insert(schema.contacts)
    .values({ name: body.name || null, phone, isTest: true, ...ORIGINS[body.simulatedOrigin] })
    .returning();
  const [conv] = await db.insert(schema.conversations).values({ contactId: contact.id }).returning();
  return NextResponse.json({ id: conv.id });
}
