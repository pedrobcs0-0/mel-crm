import { NextResponse } from "next/server";
import type { z } from "zod";

export function bad(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

/** Bloqueia requisições de outras origens (proteção extra contra CSRF). */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) return true;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function parseBody<T extends z.ZodType>(req: Request, schema: T): Promise<z.infer<T> | null> {
  try {
    const r = schema.safeParse(await req.json());
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
