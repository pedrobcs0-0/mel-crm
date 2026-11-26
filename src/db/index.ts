import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { pg?: ReturnType<typeof postgres> };

function client() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não configurada");
  // prepare:false é necessário com poolers (Neon/PgBouncer) e inofensivo localmente.
  return postgres(url, { max: 5, prepare: false });
}

export const sql = globalForDb.pg ?? client();
if (process.env.NODE_ENV !== "production") globalForDb.pg = sql;

export const db = drizzle(sql, { schema });
export { schema };
