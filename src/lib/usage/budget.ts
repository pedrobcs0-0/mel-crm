import { sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import type { Settings } from "@/db/schema";

/** Teto absoluto mensal (US$) que a interface não consegue ultrapassar. */
export const HARD_MONTHLY_CAP_USD = Number(process.env.AI_HARD_MONTHLY_CAP_USD || 10);
export const TZ = "America/Cuiaba";

export async function getSettings(): Promise<Settings> {
  const rows = await db.select().from(schema.settings).limit(1);
  if (rows[0]) return rows[0];
  const [created] = await db.insert(schema.settings).values({ id: 1 }).onConflictDoNothing().returning();
  return created ?? (await db.select().from(schema.settings).limit(1))[0];
}

export async function getSpend(): Promise<{ today: number; month: number }> {
  const [row] = await db
    .select({
      today: dsql<string>`coalesce(sum(${schema.aiUsage.costUsd}) filter (where ${schema.aiUsage.createdAt} >= (date_trunc('day', now() at time zone ${TZ}) at time zone ${TZ})), 0)`,
      month: dsql<string>`coalesce(sum(${schema.aiUsage.costUsd}) filter (where ${schema.aiUsage.createdAt} >= (date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})), 0)`,
    })
    .from(schema.aiUsage);
  return { today: Number(row?.today ?? 0), month: Number(row?.month ?? 0) };
}

export type BudgetCheck = { ok: true } | { ok: false; reason: string };

/** Decide se uma chamada pode ser feita, considerando o custo de pior caso dela. */
export function evaluateBudget(
  s: Pick<Settings, "dailyLimitUsd" | "monthlyLimitUsd" | "aiPaused">,
  spend: { today: number; month: number },
  worstCaseCall: number,
): BudgetCheck {
  if (s.aiPaused) return { ok: false, reason: "A IA está pausada na tela de Consumo." };
  const monthly = Math.min(s.monthlyLimitUsd, HARD_MONTHLY_CAP_USD);
  if (spend.month + worstCaseCall > monthly)
    return { ok: false, reason: `Limite mensal de US$ ${monthly.toFixed(2)} atingido.` };
  if (spend.today + worstCaseCall > s.dailyLimitUsd)
    return { ok: false, reason: `Limite diário de US$ ${s.dailyLimitUsd.toFixed(2)} atingido.` };
  return { ok: true };
}
