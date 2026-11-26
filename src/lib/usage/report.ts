import { desc, sql as dsql } from "drizzle-orm";
import { db, schema } from "@/db";
import { getSettings, getSpend, HARD_MONTHLY_CAP_USD, TZ } from "./budget";

export async function usageReport() {
  const [settings, spend, recent, daily, counts] = await Promise.all([
    getSettings(),
    getSpend(),
    db.select().from(schema.aiUsage).orderBy(desc(schema.aiUsage.createdAt)).limit(30),
    db
      .select({
        day: dsql<string>`to_char(${schema.aiUsage.createdAt} at time zone ${TZ}, 'YYYY-MM-DD')`,
        cost: dsql<string>`sum(${schema.aiUsage.costUsd})`,
        calls: dsql<number>`count(*)::int`,
      })
      .from(schema.aiUsage)
      .where(dsql`${schema.aiUsage.createdAt} > now() - interval '14 days'`)
      .groupBy(dsql`1`)
      .orderBy(dsql`1`),
    db
      .select({
        calls: dsql<number>`count(*) filter (where ${schema.aiUsage.status} = 'ok')::int`,
        blocked: dsql<number>`count(*) filter (where ${schema.aiUsage.status} = 'bloqueado')::int`,
        errors: dsql<number>`count(*) filter (where ${schema.aiUsage.status} = 'erro')::int`,
      })
      .from(schema.aiUsage)
      .where(dsql`${schema.aiUsage.createdAt} >= (date_trunc('month', now() at time zone ${TZ}) at time zone ${TZ})`),
  ]);
  return {
    settings,
    spend,
    hardCap: HARD_MONTHLY_CAP_USD,
    recent,
    daily: daily.map((d) => ({ day: d.day, cost: Number(d.cost), calls: d.calls })),
    month: counts[0] ?? { calls: 0, blocked: 0, errors: 0 },
    keyConfigured: Boolean(process.env.OPENAI_API_KEY) || process.env.AI_PROVIDER === "mock",
    model: process.env.AI_PROVIDER === "mock" ? "mock" : process.env.OPENAI_MODEL || "gpt-5-mini",
  };
}
export type UsageReport = Awaited<ReturnType<typeof usageReport>>;
