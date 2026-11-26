import { NextResponse } from "next/server";
import { z } from "zod";
import { bad, parseBody, sameOrigin } from "@/lib/api";
import { createSessionToken, passwordMatches, SESSION_COOKIE, sessionCookieOptions } from "@/lib/auth";

// Limite simples por instância contra tentativas repetidas.
const attempts = new Map<string, { count: number; until: number }>();

export async function POST(req: Request) {
  if (!sameOrigin(req)) return bad("Origem inválida", 403);
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
  const now = Date.now();
  const a = attempts.get(ip);
  if (a && a.count >= 5 && a.until > now) return bad("Muitas tentativas. Aguarde alguns minutos.", 429);

  const body = await parseBody(req, z.object({ password: z.string().max(200) }));
  if (!body || !(await passwordMatches(body.password))) {
    const next = a && a.until > now ? a.count + 1 : 1;
    attempts.set(ip, { count: next, until: now + 10 * 60_000 });
    await new Promise((r) => setTimeout(r, 600));
    return bad("Senha incorreta", 401);
  }
  attempts.delete(ip);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(), sessionCookieOptions);
  return res;
}
