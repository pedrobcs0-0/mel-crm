import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, schema } from "@/db";
import { bad, parseBody, sameOrigin } from "@/lib/api";
import { getSettings, HARD_MONTHLY_CAP_USD } from "@/lib/usage/budget";

const Body = z.object({
  dailyLimitUsd: z.number().min(0).max(HARD_MONTHLY_CAP_USD),
  monthlyLimitUsd: z.number().min(0).max(HARD_MONTHLY_CAP_USD),
  aiPaused: z.boolean(),
});

export async function PUT(req: Request) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const body = await parseBody(req, Body);
  if (!body) return bad(`Valores inválidos. O limite máximo permitido é US$ ${HARD_MONTHLY_CAP_USD}.`);
  if (body.dailyLimitUsd > body.monthlyLimitUsd) return bad("O limite diário não pode ser maior que o mensal.");
  await getSettings();
  await db.update(schema.settings).set({ ...body, updatedAt: new Date() }).where(eq(schema.settings.id, 1));
  return NextResponse.json({ ok: true });
}
